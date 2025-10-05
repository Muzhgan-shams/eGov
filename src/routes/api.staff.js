// --- path: src/routes/api.staff.js
// Minimal staff JSON endpoints (useful for SPA or testing)
const express = require('express');
const { requireAuthJson, requireRoleJson } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

router.get('/staff/me', requireAuthJson, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, email: u.email, role: u.role, name: u.name, department_id: u.department_id });
});

router.get('/officer/requests', requireAuthJson, requireRoleJson(['OFFICER','DEPT_HEAD','ADMIN']), async (req, res, next) => {
  try {
    const dept = req.user.role === 'ADMIN' ? null : req.user.department_id;
    const { rows } = await query(`
      SELECT r.id, r.status, r.submitted_at,
             s.name AS service, d.name AS department,
             u.name AS citizen_name
      FROM requests r
      JOIN services s ON s.id = r.service_id
      JOIN departments d ON d.id = s.department_id
      JOIN users u ON u.id = r.citizen_id
      WHERE ($1::bigint IS NULL OR d.id = $1)
      ORDER BY r.submitted_at DESC
    `, [dept]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/officer/requests/:id', requireAuthJson, requireRoleJson(['OFFICER','DEPT_HEAD','ADMIN']), async (req, res, next) => {
  try {
    const dept = req.user.role === 'ADMIN' ? null : req.user.department_id;
    const { rows } = await query(`
      SELECT r.*, s.name AS service, d.name AS department,
             u.name AS citizen_name, u.email AS citizen_email
      FROM requests r
      JOIN services s ON s.id = r.service_id
      JOIN departments d ON d.id = s.department_id
      JOIN users u ON u.id = r.citizen_id
      WHERE r.id=$1 AND ($2::bigint IS NULL OR d.id=$2)
      LIMIT 1
    `, [req.params.id, dept]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post('/officer/requests/:id/decision', requireAuthJson, requireRoleJson(['OFFICER','DEPT_HEAD','ADMIN']), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['APPROVED','REJECTED'].includes(status)) return res.status(400).json({ error: 'bad status' });
    const dept = req.user.role === 'ADMIN' ? null : req.user.department_id;
    const { rows } = await query(`
      UPDATE requests r
      SET status=$1, decided_at=now()
      FROM services s
      WHERE r.id=$2 AND s.id=r.service_id AND ($3::bigint IS NULL OR s.department_id=$3)
      RETURNING r.id
    `, [status, req.params.id, dept]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
