const express = require('express');
const pool = require('../config/db');
const { protect } = require('../middleware/auth');
const {
  GLOBAL_ROLES,
  ensureAdminSchema,
  getUserRoles,
  canAccessAdmin,
  isGlobalAdmin
} = require('../services/adminService');

const router = express.Router();

router.use(protect);

async function requireStaff(req, res) {
  await ensureAdminSchema();
  if (!(await canAccessAdmin(req.user))) {
    res.status(403).json({ error: 'Admin or support access required' });
    return false;
  }
  return true;
}

async function requireAdmin(req, res) {
  await ensureAdminSchema();
  if (!(await isGlobalAdmin(req.user))) {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

async function writeAudit(actorId, targetUserId, action, details = {}, client = pool) {
  await client.query(
    `INSERT INTO admin_audit_log (actor_id, target_user_id, action, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [actorId, targetUserId || null, action, JSON.stringify(details)]
  );
}

router.get('/overview', async (req, res) => {
  if (!(await requireStaff(req, res))) return;

  try {
    const users = await pool.query(
      `SELECT u.id, u.username, u.user_tag, u.avatar_url, u.current_status,
              COALESCE(json_agg(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL), '[]') AS roles,
              COALESCE(um.is_banned, FALSE) AS is_banned,
              COALESCE(um.ban_reason, '') AS ban_reason,
              um.muted_until,
              COALESCE(um.mute_reason, '') AS mute_reason,
              COUNT(DISTINCT r.id)::int AS open_reports
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN user_moderation um ON um.user_id = u.id
       LEFT JOIN user_reports r ON r.target_user_id = u.id AND r.status IN ('open', 'reviewing')
       GROUP BY u.id, um.is_banned, um.ban_reason, um.muted_until, um.mute_reason
       ORDER BY u.id ASC
       LIMIT 200`
    );

    const reports = await pool.query(
      `SELECT r.id, r.reason, r.context, r.status, r.resolution, r.created_at, r.updated_at,
              reporter.id AS reporter_id, reporter.username AS reporter_username,
              target.id AS target_user_id, target.username AS target_username
       FROM user_reports r
       LEFT JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users target ON target.id = r.target_user_id
       ORDER BY (r.status IN ('open', 'reviewing')) DESC, r.created_at DESC
       LIMIT 80`
    );

    const audit = await pool.query(
      `SELECT aal.id, aal.action, aal.details, aal.created_at,
              actor.username AS actor_username,
              target.username AS target_username
       FROM admin_audit_log aal
       LEFT JOIN users actor ON actor.id = aal.actor_id
       LEFT JOIN users target ON target.id = aal.target_user_id
       ORDER BY aal.created_at DESC
       LIMIT 50`
    );

    const myRoles = await getUserRoles(req.user);
    return res.json({
      roles: myRoles,
      users: users.rows.map(user => ({
        ...user,
        roles: Array.isArray(user.roles) ? user.roles : []
      })),
      reports: reports.rows,
      audit: audit.rows
    });
  } catch (err) {
    console.error('Admin overview failed:', err.message);
    return res.status(500).json({ error: 'Could not load admin panel' });
  }
});

router.get('/moderation-center', async (req, res) => {
  if (!(await requireStaff(req, res))) return;

  try {
    const disputes = await pool.query(
      `SELECT md.id, md.trade_id, md.reason, md.status, md.created_at, md.resolution, md.resolved_at, md.moderator_note,
              md.payout_user_id, md.payout_amount, md.payout_note, md.risk_score_snapshot, md.risk_breakdown,
              mt.price, mt.status AS trade_status,
              ml.title,
              buyer.id AS buyer_id, buyer.username AS buyer_username,
              seller.id AS seller_id, seller.username AS seller_username,
              payout_user.username AS payout_username,
              (SELECT COUNT(*)::int FROM market_dispute_evidence mde WHERE mde.dispute_id = md.id) AS evidence_count,
              (SELECT COUNT(*)::int FROM market_dispute_events mdev WHERE mdev.dispute_id = md.id) AS event_count
       FROM market_disputes md
       JOIN market_trades mt ON mt.id = md.trade_id
       JOIN market_listings ml ON ml.id = mt.listing_id
       JOIN users buyer ON buyer.id = md.buyer_id
       JOIN users seller ON seller.id = md.seller_id
       LEFT JOIN users payout_user ON payout_user.id = md.payout_user_id
       ORDER BY (md.status = 'open') DESC, md.created_at DESC
       LIMIT 50`
    );

    const reports = await pool.query(
      `SELECT r.id, r.reason, r.context, r.status, r.resolution, r.created_at, r.updated_at,
              reporter.id AS reporter_id, reporter.username AS reporter_username,
              target.id AS target_user_id, target.username AS target_username
       FROM user_reports r
       LEFT JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users target ON target.id = r.target_user_id
       ORDER BY (r.status IN ('open', 'reviewing')) DESC, r.created_at DESC
       LIMIT 50`
    );

    const suspiciousTrades = await pool.query(
      `SELECT mt.id, mt.price, mt.status, mt.created_at, mt.trade_hash,
              ml.title, ml.category,
              buyer.id AS buyer_id, buyer.username AS buyer_username,
              seller.id AS seller_id, seller.username AS seller_username,
              COALESCE(sr.avg_rating, 0) AS seller_rating,
              COALESCE(sr.review_count, 0) AS seller_review_count,
              COALESCE(st.completed_trades, 0) AS seller_completed_trades,
              (EXTRACT(EPOCH FROM (NOW() - mt.created_at)) / 3600)::numeric(10,1) AS pending_hours,
              (
                CASE WHEN mt.price >= 500 THEN 2 ELSE 0 END
                + CASE WHEN COALESCE(st.completed_trades, 0) = 0 THEN 2 ELSE 0 END
                + CASE WHEN COALESCE(sr.avg_rating, 0) < 4 AND COALESCE(sr.review_count, 0) > 0 THEN 1 ELSE 0 END
                + CASE WHEN mt.created_at < NOW() - INTERVAL '24 hours' THEN 2 ELSE 0 END
              ) AS risk_score
       FROM market_trades mt
       JOIN market_listings ml ON ml.id = mt.listing_id
       JOIN users buyer ON buyer.id = mt.buyer_id
       JOIN users seller ON seller.id = mt.seller_id
       LEFT JOIN (
         SELECT seller_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS review_count
         FROM market_reviews
         GROUP BY seller_id
       ) sr ON sr.seller_id = mt.seller_id
       LEFT JOIN (
         SELECT seller_id, COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_trades
         FROM market_trades
         GROUP BY seller_id
       ) st ON st.seller_id = mt.seller_id
       WHERE mt.status = 'pending'
       ORDER BY risk_score DESC, mt.created_at ASC
       LIMIT 50`
    );

    const newSellers = await pool.query(
      `SELECT seller.id AS seller_id, seller.username AS seller_username, seller.avatar_url,
              MIN(ml.created_at) AS first_listing_at,
              COUNT(ml.id)::int AS active_listings,
              COALESCE(st.completed_trades, 0) AS completed_trades,
              COALESCE(sr.avg_rating, 0) AS seller_rating,
              COALESCE(sr.review_count, 0) AS seller_review_count,
              COALESCE(dd.dispute_count, 0) AS dispute_count
       FROM market_listings ml
       JOIN users seller ON seller.id = ml.seller_id
       LEFT JOIN (
         SELECT seller_id, COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_trades
         FROM market_trades
         GROUP BY seller_id
       ) st ON st.seller_id = ml.seller_id
       LEFT JOIN (
         SELECT seller_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS review_count
         FROM market_reviews
         GROUP BY seller_id
       ) sr ON sr.seller_id = ml.seller_id
       LEFT JOIN (
         SELECT seller_id, COUNT(*)::int AS dispute_count
         FROM market_disputes
         GROUP BY seller_id
       ) dd ON dd.seller_id = ml.seller_id
       WHERE ml.status = 'active'
       GROUP BY seller.id, st.completed_trades, sr.avg_rating, sr.review_count, dd.dispute_count
       HAVING COALESCE(st.completed_trades, 0) < 3
       ORDER BY MIN(ml.created_at) DESC
       LIMIT 40`
    );

    const audit = await pool.query(
      `SELECT aal.id, aal.action, aal.details, aal.created_at,
              actor.username AS actor_username,
              target.username AS target_username
       FROM admin_audit_log aal
       LEFT JOIN users actor ON actor.id = aal.actor_id
       LEFT JOIN users target ON target.id = aal.target_user_id
       ORDER BY aal.created_at DESC
       LIMIT 60`
    );

    const summary = {
      openDisputes: disputes.rows.filter(item => item.status === 'open').length,
      openReports: reports.rows.filter(item => ['open', 'reviewing'].includes(item.status)).length,
      suspiciousTrades: suspiciousTrades.rows.filter(item => Number(item.risk_score || 0) > 0).length,
      newSellers: newSellers.rows.length,
      auditEvents: audit.rows.length
    };

    return res.json({
      summary,
      disputes: disputes.rows,
      reports: reports.rows,
      suspiciousTrades: suspiciousTrades.rows,
      newSellers: newSellers.rows,
      audit: audit.rows
    });
  } catch (err) {
    console.error('Moderation center failed:', err.message);
    return res.status(500).json({ error: 'Could not load moderation center' });
  }
});

router.post('/users/:userId/roles', async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const targetUserId = Number(req.params.userId);
  const role = String(req.body.role || '').trim();
  const enabled = !!req.body.enabled;

  if (!Number.isInteger(targetUserId) || !GLOBAL_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role update' });
  }
  if (targetUserId === 1 && role === 'admin' && !enabled) {
    return res.status(400).json({ error: 'Root admin cannot lose admin role' });
  }

  const client = await pool.connect();
  try {
    await ensureAdminSchema();
    await client.query('BEGIN');

    const target = await client.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
    if (!target.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    if (enabled) {
      await client.query(
        `INSERT INTO user_roles (user_id, role, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role) DO UPDATE SET granted_by = EXCLUDED.granted_by`,
        [targetUserId, role, req.user.id]
      );
      if (role === 'market_moderator') {
        await client.query(
          `INSERT INTO market_moderators (user_id, granted_by)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET granted_by = EXCLUDED.granted_by`,
          [targetUserId, req.user.id]
        );
      }
    } else {
      await client.query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2', [targetUserId, role]);
      if (role === 'market_moderator') {
        await client.query('DELETE FROM market_moderators WHERE user_id = $1', [targetUserId]);
      }
    }

    await writeAudit(req.user.id, targetUserId, enabled ? 'role_granted' : 'role_revoked', { role }, client);
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Role update failed:', err.message);
    return res.status(500).json({ error: 'Could not update role' });
  } finally {
    client.release();
  }
});

router.post('/users/:userId/moderation', async (req, res) => {
  if (!(await requireStaff(req, res))) return;

  const targetUserId = Number(req.params.userId);
  const action = String(req.body.action || '').trim();
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  const minutes = Math.max(1, Math.min(Number(req.body.minutes || 60), 43200));

  if (!Number.isInteger(targetUserId) || !['ban', 'unban', 'mute', 'unmute'].includes(action)) {
    return res.status(400).json({ error: 'Invalid moderation action' });
  }
  if (targetUserId === 1 && ['ban', 'mute'].includes(action)) {
    return res.status(400).json({ error: 'Root admin cannot be banned or muted' });
  }

  try {
    await ensureAdminSchema();
    const target = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });

    if (action === 'ban') {
      await pool.query(
        `INSERT INTO user_moderation (user_id, is_banned, ban_reason, banned_by, banned_at, updated_at)
         VALUES ($1, TRUE, $2, $3, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET is_banned = TRUE, ban_reason = EXCLUDED.ban_reason, banned_by = EXCLUDED.banned_by,
             banned_at = NOW(), updated_at = NOW()`,
        [targetUserId, reason || 'Banned by admin team', req.user.id]
      );
    } else if (action === 'unban') {
      await pool.query(
        `INSERT INTO user_moderation (user_id, is_banned, updated_at)
         VALUES ($1, FALSE, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET is_banned = FALSE, ban_reason = '', banned_by = NULL, banned_at = NULL, updated_at = NOW()`,
        [targetUserId]
      );
    } else if (action === 'mute') {
      await pool.query(
        `INSERT INTO user_moderation (user_id, muted_until, mute_reason, muted_by, muted_at, updated_at)
         VALUES ($1, NOW() + ($2 || ' minutes')::interval, $3, $4, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET muted_until = NOW() + ($2 || ' minutes')::interval,
             mute_reason = EXCLUDED.mute_reason,
             muted_by = EXCLUDED.muted_by,
             muted_at = NOW(),
             updated_at = NOW()`,
        [targetUserId, String(minutes), reason || 'Muted by support', req.user.id]
      );
    } else if (action === 'unmute') {
      await pool.query(
        `INSERT INTO user_moderation (user_id, muted_until, updated_at)
         VALUES ($1, NULL, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET muted_until = NULL, mute_reason = '', muted_by = NULL, muted_at = NULL, updated_at = NOW()`,
        [targetUserId]
      );
    }

    await writeAudit(req.user.id, targetUserId, action, { reason, minutes: action === 'mute' ? minutes : null });
    return res.json({ success: true });
  } catch (err) {
    console.error('Moderation action failed:', err.message);
    return res.status(500).json({ error: 'Could not apply moderation action' });
  }
});

router.post('/reports', async (req, res) => {
  const targetUserId = Number(req.body.targetUserId);
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  const context = String(req.body.context || '').trim().slice(0, 1000);

  if (!Number.isInteger(targetUserId) || !reason) {
    return res.status(400).json({ error: 'Target user and reason are required' });
  }

  try {
    await ensureAdminSchema();
    const report = await pool.query(
      `INSERT INTO user_reports (reporter_id, target_user_id, reason, context)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.user.id, targetUserId, reason, context]
    );
    return res.status(201).json({ success: true, reportId: report.rows[0].id });
  } catch (err) {
    console.error('Report create failed:', err.message);
    return res.status(500).json({ error: 'Could not create report' });
  }
});

router.patch('/reports/:reportId', async (req, res) => {
  if (!(await requireStaff(req, res))) return;

  const reportId = Number(req.params.reportId);
  const status = String(req.body.status || '').trim();
  const resolution = String(req.body.resolution || '').trim().slice(0, 500);

  if (!Number.isInteger(reportId) || !['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid report update' });
  }

  try {
    await ensureAdminSchema();
    const updated = await pool.query(
      `UPDATE user_reports
       SET status = $1, resolution = $2, assigned_to = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING target_user_id`,
      [status, resolution, req.user.id, reportId]
    );

    if (!updated.rows[0]) return res.status(404).json({ error: 'Report not found' });

    await writeAudit(req.user.id, updated.rows[0].target_user_id, 'report_updated', { reportId, status, resolution });
    return res.json({ success: true });
  } catch (err) {
    console.error('Report update failed:', err.message);
    return res.status(500).json({ error: 'Could not update report' });
  }
});

module.exports = router;
