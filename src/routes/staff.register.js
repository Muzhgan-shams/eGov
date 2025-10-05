// --- path: src/routes/staff.register.js
// Optional: staff self-signup (status=PENDING until admin approves)
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');

const router = express.Router();

router.get('/staff/register', (req, res) => {
  res.render('auth/staff-register', { title:'Request Staff Account', err: req.query.err, ok: req.query.ok });
});

router.post('/staff/register', async (req, res) => {
  try {
    const { email, name, jobTitle, password } = req.body;
    if (!email || !name || !password) return res.redirect('/staff/register?err=missing');
    const emailNorm = email.trim().toLowerCase();

    const exists = await query(`SELECT 1 FROM users WHERE LOWER(email)=$1`, [emailNorm]);
    if (exists.rowCount) return res.redirect('/staff/register?err=exists');

    const hash = await bcrypt.hash(password,10);
    await query(`
      INSERT INTO users (email, password_hash, role, name, job_title, provider, status)
      VALUES ($1,$2,'OFFICER',$3,$4,'local','PENDING')
    `, [emailNorm, hash, name.trim(), jobTitle || null]);

    return res.redirect('/staff/register?ok=sent');
  } catch {
    return res.redirect('/staff/register?err=fail');
  }
});

module.exports = router;
