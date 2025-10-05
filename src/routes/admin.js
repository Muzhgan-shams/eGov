
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

/** Admin dashboard */
router.get('/', async (_req, res, next) => {
  try {
    const [all, sub, rev, app, rej] = await Promise.all([
      db.query(`SELECT COUNT(*)::int c FROM requests`),
      db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='SUBMITTED'`),
      db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='UNDER_REVIEW'`),
      db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='APPROVED'`),
      db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='REJECTED'`)
    ]);

    const recent = await db.query(`
      SELECT r.id, r.status, r.submitted_at, s.name AS service, u.name AS citizen_name
      FROM requests r
      JOIN services s ON s.id = r.service_id
      JOIN users u    ON u.id = r.citizen_id
      ORDER BY r.submitted_at DESC
      LIMIT 10
    `);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      totals: {
        all: all.rows[0].c,
        submitted: sub.rows[0].c,
        underReview: rev.rows[0].c,
        approved: app.rows[0].c,
        rejected: rej.rows[0].c
      },
      recent: recent.rows
    });
  } catch (e) { next(e); }
});

/** Users list + approve/disable (simple list page) */
router.get('/users', async (_req, res, next) => {
  try {
    const users = await db.query(`
      SELECT id, email, role, name, status, department_id
      FROM users ORDER BY id DESC
    `);
    const deps = await db.query(`SELECT id, name FROM departments ORDER BY name`);
    res.render('admin/users', { title:'Users', users: users.rows, deps: deps.rows, ok: req.query?.ok, err: req.query?.err });
  } catch (e) { next(e); }
});

router.post('/users/:id/approve', async (req, res, next) => {
  try {
    const { department_id, role } = req.body;
    await db.query(
      `UPDATE users SET status='ACTIVE', role=$1, department_id=$2 WHERE id=$3`,
      [role || 'OFFICER', department_id || null, req.params.id]
    );
    res.redirect('/admin/users?ok=approved');
  } catch (e) { next(e); }
});

router.post('/users/:id/disable', async (req, res, next) => {
  try {
    await db.query(`UPDATE users SET status='DISABLED' WHERE id=$1`, [req.params.id]);
    res.redirect('/admin/users?ok=disabled');
  } catch (e) { next(e); }
});

/** Departments manage */
router.get('/departments', async (_req, res, next) => {
  try {
    const rows = await db.query(`SELECT id, name FROM departments ORDER BY name`);
    res.render('admin/departments', { title: 'Departments', rows: rows.rows, ok: req.query?.ok, err: req.query?.err });
  } catch (e) { next(e); }
});

router.post('/departments', async (req, res, next) => {
  try {
    await db.query(`INSERT INTO departments(name) VALUES ($1) ON CONFLICT DO NOTHING`, [req.body.name]);
    res.redirect('/admin/departments?ok=1');
  } catch (e) { next(e); }
});

/** Services manage */
router.get('/services', async (_req, res, next) => {
  try {
    const svcs = await db.query(`
      SELECT s.id, s.name, s.fee_cents, d.name AS department
      FROM services s JOIN departments d ON d.id=s.department_id
      ORDER BY d.name, s.name
    `);
    const deps = await db.query(`SELECT id, name FROM departments ORDER BY name`);
    res.render('admin/services', { title:'Services', rows: svcs.rows, deps: deps.rows, ok: req.query?.ok });
  } catch (e) { next(e); }
});

router.post('/services', async (req, res, next) => {
  try {
    const { department_id, name, fee_cents } = req.body;
    await db.query(
      `INSERT INTO services(department_id, name, fee_cents) VALUES ($1,$2,$3)`,
      [department_id, name, fee_cents || 0]
    );
    res.redirect('/admin/services?ok=1');
  } catch (e) { next(e); }
});

/** Reports (simple by department) */
router.get('/reports', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT d.name AS department,
             COUNT(r.*)::int AS total,
             COUNT(*) FILTER (WHERE r.status='APPROVED')::int AS approved,
             COUNT(*) FILTER (WHERE r.status='REJECTED')::int AS rejected
      FROM services s
      JOIN departments d ON d.id=s.department_id
      LEFT JOIN requests r ON r.service_id=s.id
      GROUP BY d.name
      ORDER BY d.name
    `);
    res.render('admin/reports', { title:'Reports', rows });
  } catch (e) { next(e); }
});

module.exports = router;
