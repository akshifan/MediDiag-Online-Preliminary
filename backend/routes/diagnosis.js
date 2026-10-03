// backend/routes/diagnosis.js
// Legacy alias route. The canonical diagnosis proxy lives in backend/server.js (/api/diagnose).
// Kept for backward compatibility; converts to CommonJS to match project.
const express = require('express');
const axios = require('axios');

const router = express.Router();

router.post('/diagnose', async (req, res) => {
  try {
    const { symptoms } = req.body || {};
    if (!symptoms || String(symptoms).trim().length === 0) {
      return res.status(400).json({ error: 'No symptoms provided' });
    }

    const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000';
    const response = await axios.post(
      `${mlUrl}/analyze`,
      { symptoms },
      { timeout: Number(process.env.ML_TIMEOUT_MS || 8000) }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Legacy /diagnose route error:', err.message || err);
    return res.status(502).json({ error: 'ML service is offline' });
  }
});

module.exports = router;