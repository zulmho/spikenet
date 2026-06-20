const express = require('express');
const pool = require('../config/db');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

let telemetrySchemaReady = false;

async function ensureTelemetrySchema() {
  if (telemetrySchemaReady) return;
  await pool.query("SELECT to_regclass('public.client_events') AS events_table");
  telemetrySchemaReady = true;
}

function safePayload(value, maxBytes = 12000) {
  const json = JSON.stringify(value || {});
  if (json.length <= maxBytes) return JSON.parse(json);
  return {
    truncated: true,
    originalBytes: json.length,
    keys: value && typeof value === 'object' ? Object.keys(value).slice(0, 40) : []
  };
}

router.post('/events', async (req, res) => {
  const eventType = String(req.body.event || req.body.type || 'event').trim().slice(0, 100);
  const app = String(req.body.app || 'spikenet').trim().slice(0, 60);
  const url = String(req.body.url || '').trim().slice(0, 1000);

  try {
    await ensureTelemetrySchema();
    await pool.query(
      `INSERT INTO client_events (event_type, app, payload, url, user_agent, ip_hash)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [
        eventType || 'event',
        app || 'spikenet',
        JSON.stringify(safePayload(req.body)),
        url,
        String(req.headers['user-agent'] || '').slice(0, 500),
        String(req.ip || '').slice(0, 80)
      ]
    );
    return res.status(202).json({ success: true });
  } catch (err) {
    console.error('Telemetry event failed:', err.message);
    return res.status(202).json({ success: false });
  }
});

router.post('/client-errors', async (req, res) => {
  const error = req.body.error || {};
  const message = String(error.message || req.body.message || 'Client error').slice(0, 500);

  try {
    await ensureTelemetrySchema();
    await pool.query(
      `INSERT INTO client_errors (app, release, environment, message, payload, url, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        String(req.body.app || 'spikenet').slice(0, 60),
        String(req.body.release || '').slice(0, 80),
        String(req.body.environment || '').slice(0, 80),
        message,
        JSON.stringify(safePayload(req.body)),
        String(req.body.url || '').slice(0, 1000),
        String(req.headers['user-agent'] || req.body.userAgent || '').slice(0, 500)
      ]
    );
    return res.status(202).json({ success: true });
  } catch (err) {
    console.error('Client error report failed:', err.message);
    return res.status(202).json({ success: false });
  }
});

router.post('/feedback', validateBody({
  email: { type: 'string', max: 160, default: '' },
  message: { type: 'string', min: 3, max: 2000, required: true },
  rating: { type: 'string', max: 20, default: '' },
  project: { type: 'string', max: 80, default: 'spikenet' },
  page: { type: 'string', max: 1000, default: '' },
  userAgent: { type: 'string', max: 500, default: '' }
}), async (req, res) => {
  try {
    await ensureTelemetrySchema();
    const result = await pool.query(
      `INSERT INTO client_feedback (project, email, rating, message, page, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        req.body.project,
        req.body.email,
        req.body.rating,
        req.body.message,
        req.body.page,
        req.body.userAgent || String(req.headers['user-agent'] || '').slice(0, 500)
      ]
    );
    return res.status(201).json({ success: true, feedback: result.rows[0] });
  } catch (err) {
    console.error('Feedback save failed:', err.message);
    return res.status(500).json({ error: 'Could not save feedback' });
  }
});

module.exports = router;
