
// src/passport.js
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./db');

passport.serializeUser((u, done) => done(null, { id: u.id, role: u.role }));
passport.deserializeUser(async (payload, done) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, role, name, department_id, status
       FROM users WHERE id=$1 LIMIT 1`, [payload.id]
    );
    const u = rows[0];
    if (!u) return done(null, false);
    done(null, {
      id: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
      department_id: u.department_id || null,
      status: u.status || 'ACTIVE',
    });
  } catch (e) { done(e); }
});

// Local (case-insensitive email)
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const emailNorm = (email || '').trim().toLowerCase();
    const { rows } = await db.query(
      `SELECT * FROM users WHERE LOWER(email)=$1 LIMIT 1`, [emailNorm]
    );
    const u = rows[0];
    if (!u) return done(null, false, { message: 'Invalid credentials' });

    const ok = u.password_hash?.startsWith('$2')
      ? await bcrypt.compare(password, u.password_hash)
      : (password === u.password_hash);

    if (!ok) return done(null, false, { message: 'Invalid credentials' });

    // if staff, ensure status is ACTIVE
    if (['OFFICER','DEPT_HEAD','ADMIN'].includes(u.role) && u.status && u.status !== 'ACTIVE') {
      return done(null, false, { message: 'Account not active' });
    }

    return done(null, u);
  } catch (e) { return done(e); }
}));

// Google strategy (optional; guard missing env)
const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL);

if (hasGoogle) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: true,
  }, async (req, _access, _refresh, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const gid = profile.id;
      if (!email) return done(null, false, { message: 'No email from Google' });

      const { rows } = await db.query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
      const u = rows[0];
      const state = req.query?.state || ''; // 'citizen' | 'staff'

      if (u) {
        // link google id if missing
        if (!u.google_id) {
          await db.query(`UPDATE users SET google_id=$1 WHERE id=$2`, [gid, u.id]);
        }
        // enforce staff ACTIVE on staff flow
        if (state === 'staff' && ['OFFICER','DEPT_HEAD','ADMIN'].includes(u.role) && u.status !== 'ACTIVE') {
          return done(null, false, { message: 'Account not active' });
        }
        return done(null, u);
      }

      if (state === 'citizen') {
        // let route handle new citizen signup step
        return done(null, false, {
          reason: 'NEW_GOOGLE_CITIZEN',
          email,
          name: profile.displayName || email.split('@')[0],
          googleId: gid,
        });
      }

      // unknown staff
      return done(null, false, { reason: 'STAFF_NOT_FOUND' });
    } catch (e) { return done(e); }
  }));
} else {
  console.warn('Google OAuth disabled: missing GOOGLE_* env vars');
}

module.exports = passport;
