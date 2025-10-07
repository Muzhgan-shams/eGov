// src/routes/admin.js
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const db = require('../db');
const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req,res)=>{
  const [[all],[sub],[rev],[ap],[rej]] = await Promise.all([
    db.query(`SELECT COUNT(*)::int c FROM requests`),
    db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='SUBMITTED'`),
    db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='UNDER_REVIEW'`),
    db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='APPROVED'`),
    db.query(`SELECT COUNT(*)::int c FROM requests WHERE status='REJECTED'`)
  ]).then(rs => rs.map(r => r.rows));
  const recent = await db.query(`
    SELECT r.id, r.status, r.submitted_at, s.name AS service, u.name AS citizen_name
    FROM requests r JOIN services s ON s.id=r.service_id JOIN users u ON u.id=r.citizen_id
    ORDER BY r.submitted_at DESC LIMIT 10`);
  res.render('admin/dashboard', { title:'Admin', totals:{all:all.c, submitted:sub.c, underReview:rev.c, approved:ap.c, rejected:rej.c}, recent: recent.rows });
});

router.get('/users/new', async (_req,res)=>{
  const deps = await db.query(`SELECT id, name FROM departments ORDER BY name`);
  res.render('admin/user-new', { title:'Create Staff User', deps: deps.rows, ok:_req.query.ok||null, err:_req.query.err||null });
});

router.post('/users/new', async (req,res)=>{
  try {
    let { email, name, role, departmentId, password } = req.body;
    if (!email || !name || !role) return res.redirect('/admin/users/new?err=missing');
    const dept = departmentId ? Number(departmentId) : null;
    const emailNorm = email.trim().toLowerCase();
    const hash = await bcrypt.hash((password?.trim() || 'changeme123'), 10);

    const found = await db.query(`SELECT id, role FROM users WHERE LOWER(email)=$1`, [emailNorm]);
    if (found.rows[0]) {
      // promote / update
      await db.query(`UPDATE users SET role=$1, department_id=$2, password_hash=$3, provider=COALESCE(provider,'local') WHERE id=$4`,
        [role.toUpperCase(), dept, hash, found.rows[0].id]);
      return res.redirect('/admin/users/new?ok=updated');
    }
    await db.query(
      `INSERT INTO users (email, password_hash, role, name, department_id, provider, status)
       VALUES ($1,$2,$3,$4,$5,'local','ACTIVE')`,
      [emailNorm, hash, role.toUpperCase(), name.trim(), dept]
    );
    res.redirect('/admin/users/new?ok=created');
  } catch (e) {
    res.redirect('/admin/users/new?err=fail');
  }
});
// --- Departments
router.get('/departments', async (req, res) => {
  const { rows } = await db.query(`SELECT id, name, descr FROM departments ORDER BY name`);
  res.render('admin/departments', { title: 'Departments', rows, ok: req.query.ok || null, err: req.query.err || null });
});

router.post('/departments', async (req, res) => {
  try {
    const { name, descr } = req.body;
    if (!name) return res.redirect('/admin/departments?err=missing');
    await db.query(`INSERT INTO departments (name, descr) VALUES ($1,$2)`, [name.trim(), descr || null]);
    res.redirect('/admin/departments?ok=created');
  } catch {
    res.redirect('/admin/departments?err=fail');
  }
});

// --- Services
router.get('/services', async (req, res) => {
  const deps = await db.query(`SELECT id, name FROM departments ORDER BY name`);
  const svcs = await db.query(`
    SELECT s.id, s.name, s.descr, s.fee_cents, d.name AS department
    FROM services s JOIN departments d ON d.id=s.department_id
    ORDER BY d.name, s.name
  `);
  res.render('admin/services', {
    title: 'Services',
    deps: deps.rows,
    rows: svcs.rows,
    ok: req.query.ok || null,
    err: req.query.err || null
  });
});

router.post('/services', async (req, res) => {
  try {
    const { department_id, name, descr, fee_cents } = req.body;
    if (!department_id || !name) return res.redirect('/admin/services?err=missing');
    await db.query(
      `INSERT INTO services (department_id, name, descr, fee_cents) VALUES ($1,$2,$3,$4)`,
      [Number(department_id), name.trim(), descr || null, fee_cents ? Number(fee_cents) : 0]
    );
    res.redirect('/admin/services?ok=created');
  } catch {
    res.redirect('/admin/services?err=fail');
  }
});
// --- Users list
router.get('/users', async (req, res) => {
  const role = (req.query.role || '').toUpperCase();
  const p = []; let where = '';
  if (role && ['CITIZEN','OFFICER','DEPT_HEAD','ADMIN'].includes(role)) {
    where = 'WHERE role=$1'; p.push(role);
  }
  const { rows } = await db.query(
    `SELECT id, email, name, role, department_id, status FROM users ${where} ORDER BY role, email`,
    p
  );
  res.render('admin/users', { title: 'Users', rows, role });
});

// --- Reports
router.get('/reports', async (req, res) => {
  const perDept = await db.query(`
    SELECT d.name AS department,
           COUNT(r.*)::int AS total,
           SUM((r.status='APPROVED')::int)::int AS approved,
           SUM((r.status='REJECTED')::int)::int AS rejected
    FROM departments d
    LEFT JOIN services s ON s.department_id=d.id
    LEFT JOIN requests r ON r.service_id=s.id
    GROUP BY d.name
    ORDER BY d.name
  `);

  const money = await db.query(`
    SELECT COALESCE(SUM(amount_cents),0)::bigint AS cents
    FROM payments WHERE status='PAID'
  `);

  res.render('admin/reports', {
    title: 'Reports',
    perDept: perDept.rows,
    totalMoney: (money.rows[0]?.cents || 0) / 100
  });
});


module.exports = router;
