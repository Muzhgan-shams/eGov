// --- path: src/routes/citizen.js
// EJS citizen pages (same-origin, no CORS)
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
router.use(requireAuth, requireRole(['CITIZEN','OFFICER','DEPT_HEAD','ADMIN']));

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT r.id, r.status, r.submitted_at, s.name AS service, d.name AS department
      FROM requests r
      JOIN services s ON s.id=r.service_id
      JOIN departments d ON d.id=s.department_id
      WHERE r.citizen_id=$1
      ORDER BY r.submitted_at DESC
    `, [req.user.id]);
    res.render('citizen/dashboard', { title:'Citizen Dashboard', rows });
  } catch (e) { next(e); }
});

router.get('/apply', async (_req, res, next) => {
  try {
    const svcs = await db.query(`
      SELECT s.id, s.name, s.fee_cents, d.name AS department
      FROM services s JOIN departments d ON d.id=s.department_id
      ORDER BY d.name, s.name
    `);
    res.render('citizen/apply', { title:'Apply', services: svcs.rows, err: _req.query?.err, ok: _req.query?.ok });
  } catch (e) { next(e); }
});

router.post('/apply', async (req, res, next) => {
  try {
    const { serviceId, notes } = req.body;
    if (!serviceId) return res.redirect('/citizen/apply?err=missing');
    await db.query(
      `INSERT INTO requests (citizen_id, service_id, status, data)
       VALUES ($1,$2,'SUBMITTED',$3::jsonb)`,
      [req.user.id, serviceId, notes || '{}']
    );
    res.redirect('/citizen?ok=submitted');
  } catch (e) { next(e); }
});

router.get('/requests/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, s.name AS service, d.name AS department
      FROM requests r
      JOIN services s ON s.id=r.service_id
      JOIN departments d ON d.id=s.department_id
      WHERE r.id=$1 AND r.citizen_id=$2
      LIMIT 1
    `, [req.params.id, req.user.id]);
    if (!rows[0]) return res.redirect('/citizen');
    res.render('citizen/request-view', { title:`Request #${rows[0].id}`, r: rows[0] });
  } catch (e) { next(e); }
});

router.get('/profile', (req, res) => res.render('citizen/profile', { title:'My Profile' }));
router.post('/profile', async (req, res, next) => {
  try {
    const { name, phone, address, date_of_birth, national_id } = req.body;
    await db.query(
      `UPDATE users SET name=$1, phone=$2, address=$3, date_of_birth=$4, national_id=$5 WHERE id=$6`,
      [name, phone, address, date_of_birth || null, national_id || null, req.user.id]
    );
    res.redirect('/citizen/profile?ok=1');
  } catch (e) { next(e); }
});

module.exports = router;
