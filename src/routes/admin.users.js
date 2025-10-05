
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/new', async (req, res, next) => {
  try {
    const deps = await db.query(`SELECT id, name FROM departments ORDER BY name`);
    res.render('admin/user-new', {
      title: 'Create Staff User',
      deps: deps.rows,
      ok: req.query.ok,
      err: req.query.err
    });
  } catch (e) { next(e); }
});

router.post('/new', async (req, res) => {
  try {
    let { email, name, role, departmentId, password } = req.body;

    // Normalize input
    if (!email || !name || !role) return res.redirect('/admin/users/new?err=missing');
    email = String(email).trim();
    name = String(name).trim();
    role = String(role).trim().toUpperCase();

    // Normalize departmentId -> null | number
    let dept = null;
    if (typeof departmentId !== 'undefined' && departmentId !== null && String(departmentId).trim() !== '') {
      const parsed = Number(String(departmentId).trim());
      if (!Number.isFinite(parsed)) return res.redirect('/admin/users/new?err=dept_type');
      dept = parsed;
    }

    if (!['OFFICER','DEPT_HEAD','ADMIN'].includes(role))
      return res.redirect('/admin/users/new?err=role');

    // Enforce dept for officer/dept_head
    if ((role === 'OFFICER' || role === 'DEPT_HEAD') && !dept)
      return res.redirect('/admin/users/new?err=dept_required');

    // verify dept exists
    if (dept) {
      const chk = await db.query(`SELECT 1 FROM departments WHERE id = $1`, [dept]);
      if (!chk.rows[0]) return res.redirect('/admin/users/new?err=dept_not_found');
    }

    const emailNorm = email.toLowerCase();
    const hash = await bcrypt.hash((password && password.trim()) ? password : 'changeme123', 10);

    // existing user?
    const { rows } = await db.query(
      `SELECT id, email, role FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [emailNorm]
    );

    if (rows[0]) {
      const existing = rows[0];

      if (['OFFICER','DEPT_HEAD','ADMIN'].includes(existing.role)) {
        await db.query(
          `UPDATE users SET role=$1, department_id=$2 WHERE id=$3`,
          [role, dept, existing.id]
        );
        return res.redirect('/admin/users/new?ok=updated');
      }

      await db.query(
        `UPDATE users
           SET role=$1,
               department_id=$2,
               password_hash=$3,
               provider = COALESCE(provider,'local'),
               status = 'ACTIVE'
         WHERE id=$4`,
        [role, dept, hash, existing.id]
      );
      return res.redirect('/admin/users/new?ok=promoted');
    }

    await db.query(
      `INSERT INTO users (email, password_hash, role, name, department_id, provider, status)
       VALUES ($1,$2,$3,$4,$5,'local','ACTIVE')`,
      [emailNorm, hash, role, name, dept]
    );
    return res.redirect('/admin/users/new?ok=created');

  } catch (e) {
    console.error('Create staff error:', e.code, e.detail || e.message);
    if (e.code === '23505') return res.redirect('/admin/users/new?err=exists');
    if (e.code === '23503') return res.redirect('/admin/users/new?err=fk_dept');
    if (e.code === '22P02') return res.redirect('/admin/users/new?err=dept_type');
    return res.redirect('/admin/users/new?err=db_' + (e.code || 'unknown'));
  }
});

module.exports = router;
