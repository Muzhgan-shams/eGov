// src/routes/auth.js
const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';

// LOGIN (public)
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  if (req.citizen) return res.redirect('/citizen');
  res.render('auth/login', { title:'Sign in', hideNav:true, err: req.query.err || null });
});
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.redirect('/login?err=1');

    const { rows } = await query(
      `SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [email.trim()]
    );
    const u = rows[0];
    if (!u) return res.redirect('/login?err=1');

    // password check (works for both local & google-oauth placeholder)
    const ok = await bcrypt.compare(password, u.password_hash || '');
    if (!ok) return res.redirect('/login?err=1');

    // If citizen -> set cid cookie (no Passport session)
    if (u.role === 'CITIZEN') {
      res.cookie('cid', u.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        signed: true,
        maxAge: 1000 * 60 * 60 * 24 * 7
      });
      return res.redirect('/citizen');
    }

    // If staff -> use Passport session so officer/admin pages work
    req.login(u, (e) => {
      if (e) return res.redirect('/login?err=1');
      return res.redirect('/');
    });
  } catch {
    return res.redirect('/login?err=1');
  }
});

// REGISTER (citizen, public)
router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  if (req.citizen) return res.redirect('/citizen');
  res.render('auth/register', { title:'Create account', hideNav:true, err: req.query.err || null });
});
router.post('/register', async (req, res) => {
  try {
    const pending = req.signedCookies?.pending_google
      ? JSON.parse(req.signedCookies.pending_google)
      : null;

    const { email, password, name, nationalId, dateOfBirth, phone, address } = req.body;
    const emailNorm = (pending?.email || email).trim().toLowerCase();
    const displayName = pending?.name || (name || '').trim() || emailNorm.split('@')[0];

    const hash = pending ? await bcrypt.hash('google-oauth', 10)
                         : await bcrypt.hash(password, 10);

    const googleId = pending?.googleId || null;
    const provider = pending ? 'google' : 'local';

    const ins = await query(`
      INSERT INTO users (email, password_hash, role, name, national_id, date_of_birth, phone, address, google_id, provider, status)
      VALUES ($1,$2,'CITIZEN',$3,$4,$5,$6,$7,$8,$9,'ACTIVE')
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `, [emailNorm, hash, displayName, nationalId || null, dateOfBirth || null, phone || null, address || null, googleId, provider]);

    if (!ins.rows[0]) return res.redirect('/register?err=exists');

    res.clearCookie('pending_google', { sameSite: 'lax', secure: isProd });
    res.cookie('cid', ins.rows[0].id, {
      httpOnly: true, sameSite: 'lax', secure: isProd, signed: true,
      maxAge: 1000 * 60 * 60 * 24 * 7
    });
    return res.redirect('/citizen');
  } catch(e) {
    console.error('REGISTER FAIL:', e.code, e.detail || e.message);
    return res.redirect('/register?err=fail');
  }
});

// Google: staff
router.get('/auth/google', passport.authenticate('google', { scope:['profile','email'], state:'staff' }));
router.get('/auth/google/callback', (req,res,next)=>{
  passport.authenticate('google',(err,user)=>{
    if (err || !user) return res.redirect('/login?err=1');
    if (!['ADMIN','OFFICER','DEPT_HEAD'].includes(user.role)) return res.redirect('/login?err=staff_only');
    req.login(user, e => e ? res.redirect('/login?err=1') : res.redirect('/'));
  })(req,res,next);
});

// Google: citizen
router.get('/auth/google-citizen', passport.authenticate('google', { scope:['profile','email'], state:'citizen' }));
router.get('/auth/google-citizen/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    if (err) return res.redirect('/login?err=1');

    if (user) {
      if (user.role === 'CITIZEN') {
        res.cookie('cid', user.id, {
          httpOnly: true, sameSite: 'lax', secure: isProd, signed: true,
          maxAge: 1000 * 60 * 60 * 24 * 7
        });
        return res.redirect('/citizen');
      }
      return req.login(user, e => e ? res.redirect('/login?err=1') : res.redirect('/'));
    }

    if (info?.reason === 'NEW_GOOGLE_CITIZEN') {
      const payload = JSON.stringify({
        email: info.email,
        name: info.name,
        googleId: info.googleId
      });
      res.cookie('pending_google', payload, {
        httpOnly: true, sameSite: 'lax', secure: isProd, signed: true,
        maxAge: 10 * 60 * 1000 // 10 minutes
      });
      return res.redirect('/register');
    }

    return res.redirect('/login?err=1');
  })(req, res, next);
});


// Staff logout (session)
router.post('/logout', (req, res) => {
  req.logout?.(() => res.redirect('/login'));
  if (!req.logout) req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
