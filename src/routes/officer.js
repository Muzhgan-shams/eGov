const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');
const router = express.Router();

router.use(requireAuth, requireRole('OFFICER','DEPT_HEAD'));

router.get('/', async (req, res) => {
  const dept = req.user.departmentId;
  const { rows } = await db.query(`
    SELECT r.id, r.status, r.submitted_at, s.name AS service, u.name AS citizen_name
    FROM requests r JOIN services s ON s.id=r.service_id JOIN users u ON u.id=r.citizen_id
    WHERE s.department_id=$1 ORDER BY r.submitted_at DESC LIMIT 50
  `, [dept]);
  res.render('officer/inbox', { title:'Officer Inbox', user:req.user, list: rows });
});

router.get('/requests/:id', async (req, res) => {
  const { rows } = await db.query(`
    SELECT r.*, s.name AS service, s.department_id, u.name AS citizen_name
    FROM requests r JOIN services s ON s.id=r.service_id JOIN users u ON u.id=r.citizen_id
    WHERE r.id=$1 LIMIT 1
  `, [req.params.id]);
  const item = rows[0];
  if (!item || item.department_id !== req.user.departmentId) return res.status(404).send('Not found');
  res.render('officer/request', { title:`Request ${item.id}`, user:req.user, item });
});

router.post('/requests/:id/decision', async (req, res) => {
  const to = req.body.decision === 'approve' ? 'APPROVED' : 'REJECTED';
  await db.query(
    `UPDATE requests r SET status=$1, decided_at=now()
     FROM services s WHERE r.id=$2 AND s.id=r.service_id AND s.department_id=$3`,
    [to, req.params.id, req.user.departmentId]
  );
  res.redirect('/officer');
});

module.exports = router;
