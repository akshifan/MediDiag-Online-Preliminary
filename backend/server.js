

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

if (typeof fetch !== 'function') {
  console.error(
    '[server] FATAL: global fetch is not available. Node 18+ is required. ' +
    'Please upgrade Node or install an appropriate fetch polyfill.'
  );
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = socketIo(server);
const { spawn } = require('child_process');

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/vendor', express.static(path.join(__dirname, '../public/vendor')));

// Session configuration
if (!process.env.SESSION_SECRET) {
  console.warn('[server] WARNING: SESSION_SECRET is not set. Using an insecure fallback. Set SESSION_SECRET in .env for production.');
}

// NOTE: MemoryStore is dev-only. For production, swap in a persistent store
// such as connect-pg-simple or connect-redis.
app.use(session({
  secret: process.env.SESSION_SECRET || 'medidiag-dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,

  cookie: {
    // Localhost uses HTTP, so secure must be false.
    // Production HTTPS can use secure=true.
    secure: process.env.NODE_ENV === 'production'
      && process.env.APP_BASE_URL?.startsWith('https://'),

    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make user data available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Require an authenticated session for /api/* proxy routes.
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ============================================================
// DEBUG AUTH / SESSION
// ============================================================

app.use((req, res, next) => {
  if (
    req.path === '/auth/login' ||
    req.path === '/patient/dashboard' ||
    req.path === '/doctor/dashboard'
  ) {
    console.log(
      '[AUTH DEBUG]',
      req.method,
      req.path,
      'sessionID:',
      req.sessionID,
      'sessionUser:',
      req.session.user || null
    );
  }

  next();
});

// Routes
app.use('/', require('./routes/launchpageroutes'));
app.use('/auth', require('./routes/authroutes'));
app.use('/patient', require('./routes/patientroutes'));
app.use('/doctor', require('./routes/doctorroutes'));

// expose io to route handlers via app
app.set('io', io);

// API Routes for ML Service
// Use the built-in local diagnoser directly so no external ML server is required.
// API Routes for ML Service
// The trained RandomForest model in ml_service/model.py is the primary
// diagnosis engine. This route is a thin authenticated proxy so the browser
// never talks to the Flask service directly.
app.post('/api/diagnose', requireAuth, async (req, res) => {
  const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000';
  const payload = req.body || {};

  if (!payload.symptoms || String(payload.symptoms).trim().length === 0) {
    return res.status(400).json({ error: 'No symptoms provided' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.ML_TIMEOUT_MS || 8000)
    );

    const resp = await fetch(`${mlUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms: payload.symptoms }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('ML service non-OK:', resp.status, text);
      return res.status(502).json({ error: 'Diagnosis service unavailable' });
    }

    const json = await resp.json();
    return res.json(json);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('ML service request timed out');
    } else {
      console.error('ML service error:', err && err.message ? err.message : err);
    }
    return res.status(502).json({ error: 'Diagnosis service unavailable' });
  }
});

// Chat proxy â€” keeps the Gemini key server-side. The browser never sees it.
app.post('/api/chat', requireAuth, async (req, res) => {
  const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000';
  const message = (req.body && req.body.message) || '';

  if (!message || String(message).trim().length === 0) {
    return res.status(400).json({ reply: 'Please enter a message.' });
  }

  try {
    const resp = await fetch(`${mlUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      // no AbortController here: chat can legitimately take 10-20s
    });

    if (!resp.ok) {
      console.error('Chat service non-OK:', resp.status);
      return res.status(502).json({ reply: 'The AI assistant is temporarily unavailable. Please try again.' });
    }

    const json = await resp.json();
    return res.json(json);
  } catch (err) {
    console.error('Chat service error:', err && err.message ? err.message : err);
    return res.status(502).json({ reply: 'The AI assistant is temporarily unavailable. Please try again.' });
  }
});

// Health check for the ML service
app.get('/api/ml-health', async (req, res) => {
  const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000';
  try {
    const r = await fetch(`${mlUrl}/health`);
    if (!r.ok) return res.status(502).json({ status: 'ml-unreachable' });
    const j = await r.json();
    return res.json({ status: 'ok', ml: j });
  } catch (e) {
    return res.status(502).json({ status: 'ml-unreachable' });
  }
});

// Socket.io for real-time features
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-appointment', (appointmentId) => {
    socket.join(`appointment-${appointmentId}`);
  });

  // Doctor/patient chat rooms are scoped to BOTH participants.
  // Never use a patient-only room for doctor chats: that would make messages
  // sent to doctor A appear in doctor B's conversation with the same patient.
  socket.on('join-chat-thread', ({ patientId, doctorId } = {}) => {
    try {
      if (!patientId || !doctorId) return;
      socket.join(`chat-${patientId}-${doctorId}`);
    } catch (e) {
      console.error('join-chat-thread error', e);
    }
  });

  // Legacy patient-only room retained for the AI assistant only.
  socket.on('join-patient', (patientId) => {
    try {
      if (patientId) socket.join(`patient-${patientId}`);
    } catch (e) {
      console.error('join-patient error', e);
    }
  });

  socket.on('send-message', (data) => {
    io.to(`appointment-${data.appointmentId}`).emit('new-message', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error stack:', err.stack); // full stack goes to the server terminal only
  res.status(500).render('error', {
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!',
    user: req.session.user
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    error: 'Page not found',
    user: req.session.user
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ðŸš€ Server running on port ${PORT}`);
  console.log(`ðŸ“Š NODE SERVER Service: ${process.env.SERVICE_URL || 'http://localhost:3000'}`);
  console.log(`ðŸ“Š ML Service: ${process.env.ML_SERVICE_URL || 'http://localhost:5000'}`);
  console.log(`ðŸ’¾ Database: ${process.env.DB_NAME || 'medidiag'}`);
});

// Optionally auto-start the Python ML service when the Node server starts.
// Enable by setting AUTO_START_ML=true in your environment. This will spawn
// `python ml_service/model.py` from the repository root and inherit NODE env vars.
if (process.env.AUTO_START_ML === 'true') {
  try {
    const mlCmd = process.platform === 'win32' ? 'python' : 'python3';
    const mlProcess = spawn(mlCmd, ['ml_service/model.py'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: process.env.ML_PORT || '5000' },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    mlProcess.stdout.on('data', (d) => process.stdout.write(`[ml] ${d}`));
    mlProcess.stderr.on('data', (d) => process.stderr.write(`[ml err] ${d}`));

    mlProcess.on('close', (code) => {
      console.log(`ML process exited with code ${code}`);
    });

    process.on('exit', () => {
      try { mlProcess.kill(); } catch (e) {}
    });
  } catch (e) {
    console.error('Failed to auto-start ML service:', e.message || e);
  }
}