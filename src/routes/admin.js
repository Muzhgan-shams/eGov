const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');
const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const [[a],[s],[u],[ap],[r]] = await Promise.all([
    db.query(`SELECT COUNT(*)::int c FROM requests`),
    db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='SUBMITTED'`),
    db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='UNDER_REVIEW'`),
    db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='APPROVED'`),
    db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='REJECTED'`)
  ]).then(rs => rs.map(r => r.rows));
  const recent = await db.query(`
    SELECT r.id, r.status, r.submitted_at, s.name AS service, u.name AS citizen_name
    FROM requests r JOIN services s ON s.id=r.service_id JOIN users u ON u.id=r.citizen_id
    ORDER BY r.submitted_at DESC LIMIT 10
  `);
  res.render('admin/dashboard', {
    title:'Admin Dashboard', user:req.user,
    totals:{ all:a.c, submitted:s.c, underReview:u.c, approved:ap.c, rejected:r.c },
    recent: recent.rows
  });
});

module.exports = router;
