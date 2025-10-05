
// JSON auth for CITIZEN flows (React/EJS hybrid safe)
const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const db = require('../db');

const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';

// --- Citizen register (email/password OR finishing Google) ---
router.post('/register', async (req, res) => {
  try {
    const pending = req.signedCookies?.pending_google ? JSON.parse(req.signedCookies.pending_google) : null;
    const { email, password, name, nationalId, useGoogleOnly } = req.body;

    const emailNorm = (pending?.email || email || '').trim().toLowerCase();
    const displayName = pending?.name || (name || '').trim() || emailNorm.split('@')[0];
    if (!emailNorm) return res.status(400).json({ error: 'Missing email' });

    let hash;
    if (pending && useGoogleOnly) {
      hash = await bcrypt.hash('google-oauth', 10);
    } else {
      if (!password) return res.status(400).json({ error: 'Missing password' });
      hash = await bcrypt.hash(password, 10);
    }

    const googleId = pending?.googleId || null;

    const ins = await db.query(
      `INSERT INTO users (email, password_hash, role, name, national_id, google_id, provider, status)
       VALUES ($1,$2,'CITIZEN',$3,$4,$5,$6,'ACTIVE')
       RETURNING id, email, role, name`,
      [emailNorm, hash, displayName, nationalId || null, googleId, pending ? 'google' : 'local']
    );

    res.clearCookie('pending_google', { sameSite: isProd ? 'none' : 'lax', secure: isProd ? true : false });
    res.cookie('cid', ins.rows[0].id, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd ? true : false,
      signed: true,
      maxAge: 1000 * 60 * 60 * 24 * 7
    });
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    res.status(400).json({ error: 'Unable to register' });
  }
});

// --- Citizen login (cookie `cid`) ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const emailNorm = (email || '').trim().toLowerCase();
  const { rows } = await db.query(
    `SELECT id, email, password_hash, role, name FROM users WHERE LOWER(email)=$1`,
    [emailNorm]
  );
  const u = rows[0];
  if (!u || u.role !== 'CITIZEN') return res.status(401).json({ error: 'Invalid' });
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid' });

  res.cookie('cid', u.id, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd ? true : false,
    signed: true,
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
  res.json({ id: u.id, email: u.email, role: u.role, name: u.name });
});

// --- Citizen logout ---
router.post('/logout', (req, res) => {
  res.clearCookie('cid', {
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd ? true : false
  });
  res.json({ ok: true });
});

// --- Citizen me ---
router.get('/me', async (req, res) => {
  const cid = req.signedCookies?.cid || req.cookies?.cid;
  if (!cid) return res.status(401).json({ error: 'Unauthenticated' });
  const { rows } = await db.query(
    `SELECT id, email, role, name, national_id FROM users WHERE id=$1`, [cid]
  );
  const me = rows[0];
  if (!me || me.role !== 'CITIZEN') return res.status(401).json({ error: 'Unauthenticated' });
  res.json(me);
});

// --- Google for citizen ---
router.get('/google',
  passport.authenticate('google', { scope: ['profile','email'], state: 'citizen' })
);

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    const client = (process.env.CLIENT_ORIGIN || 'http://localhost:5173');
    if (err) return res.redirect(`${client}/oauth?err=1`);

    if (user) {
      // citizen existing user
      if (user.role === 'CITIZEN') {
        res.cookie('cid', user.id, {
          httpOnly: true,
          sameSite: isProd ? 'none' : 'lax',
          secure: isProd ? true : false,
          signed: true,
          maxAge: 1000 * 60 * 60 * 24 * 7
        });
      }
      return res.redirect(`${client}/oauth?ok=1`);
    }

    if (info?.reason === 'NEW_GOOGLE_CITIZEN') {
      const payload = JSON.stringify({
        email: info.email,
        name: info.name,
        googleId: info.googleId
      });
      res.cookie('pending_google', payload, {
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd ? true : false,
        signed: true,
        maxAge: 10 * 60 * 1000
      });
      return res.redirect(`${client}/signup?google=1`);
    }

    return res.redirect(`${client}/oauth?err=1`);
  })(req, res, next);
});

module.exports = router;
