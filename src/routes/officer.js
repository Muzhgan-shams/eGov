// src/routes/officer.js
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');
const router = express.Router();

router.use(requireAuth, requireRole('OFFICER','DEPT_HEAD'));

router.get('/', async (req,res)=>{
  const { rows } = await db.query(`
    SELECT r.id, r.status, r.submitted_at, s.name AS service, u.name AS citizen_name
    FROM requests r
    JOIN services s ON s.id=r.service_id
    JOIN users u ON u.id=r.citizen_id
    WHERE s.department_id=$1
    ORDER BY r.submitted_at DESC LIMIT 100`, [req.user.department_id]);
  res.render('officer/inbox', { title:'Officer Inbox', list: rows });
});

router.get('/requests/:id', async (req,res)=>{
  const q = await db.query(`
    SELECT r.*, s.name AS service, s.department_id, u.name AS citizen_name
    FROM requests r
    JOIN services s ON s.id=r.service_id
    JOIN users u ON u.id=r.citizen_id
    WHERE r.id=$1`, [req.params.id]);
  const item = q.rows[0];
  if (!item || item.department_id !== req.user.department_id) return res.status(404).send('Not found');
  const docs = await db.query(`SELECT * FROM documents WHERE request_id=$1 ORDER BY uploaded_at DESC`, [item.id]);
  res.render('officer/request', { title:`Request #${item.id}`, item, docs: docs.rows });
});

router.post('/requests/:id/decision', async (req,res)=>{
  const to = req.body.decision === 'approve' ? 'APPROVED' : 'REJECTED';
  await db.query(
    `UPDATE requests r SET status=$1, decided_at=now()
     FROM services s WHERE r.id=$2 AND s.id=r.service_id AND s.department_id=$3`,
    [to, req.params.id, req.user.department_id]
  );
  res.redirect('/officer');
});
// --- Officer profile (simple)
router.get('/profile', async (req, res) => {
  // req.user is staff (OFFICER/DEPT_HEAD)
  res.render('officer/profile', { title: 'My Profile', me: req.user });
});

router.post('/profile', async (req, res) => {
  const { name, job_title } = req.body;
  await db.query(`UPDATE users SET name=$1, job_title=$2 WHERE id=$3`, [
    name || null, job_title || null, req.user.id
  ]);
  res.redirect('/officer/profile');
});

module.exports = router;
