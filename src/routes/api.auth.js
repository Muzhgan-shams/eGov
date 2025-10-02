// src/routes/api.auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const db = require('../db');
const router = express.Router();


// Citizen register
router.post('/register', async (req, res) => {
  const { email, password, name, nationalId } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error:'Missing fields' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, role, name, national_id)
       VALUES ($1,$2,'CITIZEN',$3,$4) RETURNING id, email, role, name`,
      [email, hash, name, nationalId || null]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(400).json({ error:'Email exists?' }); }
});

// Citizen login (cookie)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await db.query(`SELECT id, email, password_hash, role, name FROM users WHERE email=$1`, [email]);
  const u = rows[0]; if (!u || u.role !== 'CITIZEN') return res.status(401).json({ error:'Invalid' });
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error:'Invalid' });
  const isProd = process.env.NODE_ENV === 'production';

// on login success:
res.cookie('cid', u.id, {
  httpOnly: true,
  sameSite: isProd ? 'lax' : 'lax',
  secure: isProd ? true : false,   // must be true on Render/HTTPS
  maxAge: 1000 * 60 * 60 * 24 * 7  // 7 days, adjust as you like
 });
  
  res.json({ id:u.id, email:u.email, role:u.role, name:u.name });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('cid', {
    sameSite: isProd ? 'lax' : 'lax',
    secure:   isProd ? true : false
  });
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const cid = req.cookies?.cid;
  if (!cid) return res.status(401).json({ error:'Unauthenticated' });
  const { rows } = await db.query(`SELECT id, email, role, name, national_id FROM users WHERE id=$1`, [cid]);
  const me = rows[0]; if (!me || me.role !== 'CITIZEN') return res.status(401).json({ error:'Unauthenticated' });
  res.json(me);
});

const isProd = process.env.NODE_ENV === 'production';

// start Google for citizen
router.get('/google',
  passport.authenticate('google', { scope: ['profile','email'], state: 'citizen' })
);


// callback with custom handler
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    if (err) {
      const to = (process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '/oauth?err=1';
      return res.redirect(to);
    }
    if (user) {
      // Existing user (citizen or staff) logging in via API:
      // We only set cid for CITIZEN
      if (user.role === 'CITIZEN') {
        res.cookie('cid', user.id, {
          httpOnly: true,
          sameSite: isProd ? 'lax' : 'lax',
          secure: isProd ? true : false,
          signed: true,
          maxAge: 1000 * 60 * 60 * 24 * 7
        });
      }
      const to = (process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '/oauth?ok=1';
      return res.redirect(to);
    }

    // No user: brand-new Google citizen -> stash pending and send to signup page
    if (info?.reason === 'NEW_GOOGLE_CITIZEN') {
      const payload = JSON.stringify({
        email: info.email,
        name: info.name,
        googleId: info.googleId
      });
      res.cookie('pending_google', payload, {
        httpOnly: true,
        sameSite: isProd ? 'lax' : 'lax',
        secure: isProd ? true : false,
        signed: true,
        maxAge: 10 * 60 * 1000 // 10 minutes to complete signup
      });
      const to = (process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '/signup?google=1';
      return res.redirect(to);
    }

    const to = (process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '/oauth?err=1';
    return res.redirect(to);
  })(req, res, next);
});

// existing /register (extend to support finishing Google signup)
router.post('/register', async (req, res) => {
  try {
    const pending = req.signedCookies?.pending_google ? JSON.parse(req.signedCookies.pending_google) : null;
    const { email, password, name, nationalId, useGoogleOnly } = req.body;

    const emailNorm = (pending?.email || email).trim().toLowerCase();
    const displayName = pending?.name || (name || '').trim() || emailNorm.split('@')[0];

    // if finishing Google-only signup (no password), allow a placeholder hash
    const hash = useGoogleOnly
      ? await bcrypt.hash('google-oauth', 10)
      : await bcrypt.hash(password, 10);

    const googleId = pending?.googleId || null;

    const ins = await db.query(
      `INSERT INTO users (email, password_hash, role, name, national_id, google_id, provider)
       VALUES ($1,$2,'CITIZEN',$3,$4,$5,$6)
       RETURNING id, email, role, name`,
      [emailNorm, hash, displayName, nationalId || null, googleId, useGoogleOnly ? 'google' : 'local']
    );

    // clear pending cookie and log in
    res.clearCookie('pending_google', { sameSite: isProd ? 'lax' : 'lax', secure: isProd ? true : false });
    res.cookie('cid', ins.rows[0].id, {
      httpOnly: true,
      sameSite: isProd ? 'lax' : 'lax',
      secure: isProd ? true : false,
      signed: true,
      maxAge: 1000 * 60 * 60 * 24 * 7
    });
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    res.status(400).json({ error: 'Unable to register' });
  }
});


module.exports = router;









