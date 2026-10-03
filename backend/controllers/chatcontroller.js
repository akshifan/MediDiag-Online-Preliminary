
// Chat controller â€” Gemini provider, server-side only.
// The Gemini API key lives in env (GEMINI_API_KEY) and is never sent to the browser.
const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

const ML_SERVICE = process.env.ML_SERVICE_URL || 'http://localhost:5000';
const User = require('../models/user');
const Patient = require('../models/patient');
const DoctorMessage = require('../models/doctormessage');
// AI chatbot store (keyed by patient user id)
const chats = new Map();

// ---------------------------------------------------------------------------
// Gemini helper
// ---------------------------------------------------------------------------
async function callGemini(promptText) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');

  let lastErr;
  for (const model of GEMINI_MODELS) {
    try {
      const resp = await axios.post(
        `${GEMINI_BASE}chat/completions`,
        {
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful, cautious medical assistant. Provide informative, non-diagnostic guidance. Always include a disclaimer that this is not medical advice and recommend consulting a qualified healthcare professional for diagnosis and treatment.',
            },
            { role: 'user', content: promptText },
          ],
          max_tokens: 500,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${GEMINI_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      const msg = resp?.data?.choices?.[0]?.message?.content;
      if (msg) return msg.trim();
      throw new Error('Empty Gemini response');
    } catch (e) {
      lastErr = e;
      console.warn(`[Gemini] model ${model} failed:`, e.message || e);
    }
  }
  throw lastErr || new Error('Gemini unavailable');
}

async function generateAIResponse(text) {
  const t = (text || '').toLowerCase();
  const symptomKeywords = [
    'fever', 'cough', 'headache', 'nausea', 'vomit', 'diarrhea',
    'pain', 'sore throat', 'temperature', 'urination',
  ];
  const containsSymptom = symptomKeywords.some((k) => t.includes(k));

  if (containsSymptom) {
    if (GEMINI_KEY) {
      try {
        const prompt = `Patient describes: "${text}"\nProvide a concise, empathetic summary, possible explanations, suggested next steps and a clear disclaimer that this is not medical advice.`;
        return await callGemini(prompt);
      } catch (e) {
        console.warn('[Chat] Gemini failed, falling back to ML /analyze:', e.message || e);
      }
    }

    try {
      const resp = await axios.post(
        `${ML_SERVICE}/analyze`,
        { symptoms: text },
        { timeout: 8000 }
      );
      const d = resp.data || {};
      const lines = [];
      if (d.diagnosis) lines.push(d.diagnosis + '.');
      if (d.recommendation) lines.push('Recommendation: ' + d.recommendation + '.');
      lines.push('Confidence: ' + (d.confidence !== undefined ? d.confidence : 'n/a'));
      lines.push('Note: This information is informational and not a substitute for professional medical advice.');
      return lines.join(' ');
    } catch (e) {
      console.warn('[Chat] ML fallback failed:', e.message || e);
      return "I couldn't run a full analysis right now â€” please provide more details about your symptoms or consult a doctor.";
    }
  }

  const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
  if (greetings.some((g) => t.startsWith(g))) {
    return 'Hello! I am MediDiag Assistant. How can I help you today? You can describe symptoms or ask about appointments and profiles.';
  }

  if (t.includes('appointment')) {
    return 'To book an appointment, go to "Find Doctors" and choose a time. If you want, tell me which specialty or preferred date and I can help.';
  }

  return "Thanks for your message â€” could you provide a bit more detail so I can assist you?";
}

// ===========================================================================
// AI chatbot (dashboard)
// ===========================================================================

exports.getMessages = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const patientId = req.session.user.id;
    const msgs = chats.get(patientId) || [];
    res.json({ messages: msgs });
  } catch (error) {
    console.error('getMessages error', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

exports.postMessage = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const patientId = req.session.user.id;
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Empty message' });

    const message = {
      sender: 'patient',
      text,
      timestamp: new Date().toISOString(),
    };

    const existing = chats.get(patientId) || [];
    existing.push(message);
    chats.set(patientId, existing);

    const io = req.app.get('io');
    if (io) io.to(`patient-${patientId}`).emit('chat-message', message);

    (async () => {
      try {
        const aiText = await generateAIResponse(text);
        const aiMessage = { sender: 'ai', text: aiText, timestamp: new Date().toISOString() };
        const cur = chats.get(patientId) || [];
        cur.push(aiMessage);
        chats.set(patientId, cur);
        if (io) io.to(`patient-${patientId}`).emit('chat-message', aiMessage);
      } catch (e) {
        console.error('AI response generation failed', e);
      }
    })();

    res.json({ success: true, message });
  } catch (error) {
    console.error('postMessage error', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
};

// ===========================================================================
// Patient <-> Doctor chat threads
// PostgreSQL-backed — persistent across logout/login/server restart
// ===========================================================================

async function getPatientThreadsData(patientId) {
    try {
        const rows = await DoctorMessage.getPatientThreads(patientId);

        return rows.map((row) => ({
            doctorId: row.doctor_id,
            doctorName: row.doctor_name,
            lastMessage: row.last_message || '',
            lastAt: row.last_at,
            unreadCount: Number(row.unread_count || 0)
        }));
    } catch (error) {
        console.error('getPatientThreadsData error:', error);
        throw error;
    }
}


async function getDoctorThreadsData(doctorId) {
    try {
        const rows = await DoctorMessage.getDoctorThreads(doctorId);

        return rows.map((row) => ({
            patientId: row.patient_id,
            patientName: row.patient_name,
            lastMessage: row.last_message || '',
            lastAt: row.last_at,
            unreadCount: Number(row.unread_count || 0)
        }));
    } catch (error) {
        console.error('getDoctorThreadsData error:', error);
        throw error;
    }
}


// Mark a conversation as read.
// patientId + doctorId uniquely identify one conversation.
async function markThreadRead(viewerRole, patientId, doctorId) {
    try {
        if (viewerRole === 'patient') {
            await DoctorMessage.markDoctorMessagesRead(
                patientId,
                doctorId
            );
        } else if (viewerRole === 'doctor') {
            await DoctorMessage.markPatientMessagesRead(
                patientId,
                doctorId
            );
        }
    } catch (error) {
        console.error('markThreadRead error:', error);
        throw error;
    }
}


exports.markThreadRead = markThreadRead;
exports.getPatientThreadsData = getPatientThreadsData;
exports.getDoctorThreadsData = getDoctorThreadsData;

exports.getMyThreads = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'patient') {
            return res.redirect('/auth/login');
        }

        const patient = await Patient.findByUserId(req.session.user.id);

        if (!patient) {
            return res.redirect('/auth/login');
        }

        const rows = await DoctorMessage.getPatientThreads(patient.id);

        const threads = rows.map((row) => ({
            doctorId: row.doctor_id,
            doctorName: row.doctor_name,
            lastMessage: row.last_message || '',
            lastAt: row.last_at,
            unreadCount: Number(row.unread_count || 0)
        }));

        res.render('patient/chats_list', {
            title: 'My Chats',
            user: req.session.user,
            patient,
            threads
        });

    } catch (error) {
    console.error('======================================');
    console.error('GET MY THREADS FAILED');
    console.error('ERROR MESSAGE:', error.message);
    console.error('ERROR CODE:', error.code);
    console.error('ERROR DETAIL:', error.detail);
    console.error('ERROR HINT:', error.hint);
    console.error('ERROR STACK:', error.stack);
    console.error('======================================');

    return res.status(500).render('error', {
        error: `Unable to load chats: ${error.message}`
    });
}
};

exports.getDoctorChatMessages = async (req, res) => {

    try {

        if (
            !req.session.user ||
            req.session.user.role !== 'patient'
        ) {
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }


        const doctorId = Number.parseInt(
            req.params.doctorId,
            10
        );


        if (
            !Number.isInteger(doctorId) ||
            doctorId <= 0
        ) {
            return res.status(400).json({
                error: 'Invalid doctor ID'
            });
        }


        const patient =
            await Patient.findByUserId(
                req.session.user.id
            );


        if (!patient) {
            return res.status(401).json({
                error: 'Patient profile not found'
            });
        }


        const messages =
            await DoctorMessage.findThread(
                patient.id,
                doctorId
            );


        await DoctorMessage.markDoctorMessagesRead(
            patient.id,
            doctorId
        );


        /*
         * Convert database format into the format
         * used by the browser.
         */
        const payload = messages.map((message) => ({

            id: message.id,

            sender: message.sender_role,

            text: message.message,

            timestamp: message.created_at,

            isRead: message.is_read

        }));


        return res.json({
            messages: payload
        });


    } catch (error) {

        console.error(
            'getDoctorChatMessages error:',
            error
        );


        return res.status(500).json({
            error: 'Failed to load messages'
        });
    }
};

exports.postDoctorChatMessage = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'patient') {
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }

        const doctorId = Number.parseInt(req.params.doctorId, 10);

        if (!Number.isInteger(doctorId) || doctorId <= 0) {
            return res.status(400).json({
                error: 'Invalid doctor ID'
            });
        }

        const text = String(req.body.text || '').trim();

        if (!text) {
            return res.status(400).json({
                error: 'Empty message'
            });
        }

        const patient = await Patient.findByUserId(req.session.user.id);

        if (!patient) {
            return res.status(401).json({
                error: 'Patient profile not found'
            });
        }

        const message = await DoctorMessage.create({
            patientId: patient.id,
            doctorId,
            senderRole: 'patient',
            message: text
        });

        const payload = {
            id: message.id,
            sender: 'patient',
            text: message.message,
            timestamp: message.created_at
        };

        // Real-time delivery
        const io = req.app.get('io');

        if (io) {

    io.to(
        `chat-${patient.id}-${doctorId}`
    ).emit(
        'chat-message',
        payload
    );

}

        res.json({
            success: true,
            message: payload
        });

    } catch (error) {
        console.error('postDoctorChatMessage error:', error);

        res.status(500).json({
            error: 'Failed to send message'
        });
    }
};

exports.chats = chats;
