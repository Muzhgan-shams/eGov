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
      `SELECT id, email, role, name, department_id, status FROM users WHERE id=$1`,
      [payload.id]
    );
    const u = rows[0]; if (!u) return done(null, false);
    done(null, u);
  } catch (e) { done(e); }
});

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const { rows } = await db.query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1)`, [email]);
    const u = rows[0]; if (!u) return done(null, false);
    const ok = await bcrypt.compare(password, u.password_hash || '');
    return ok ? done(null, u) : done(null, false);
  } catch (e) { done(e); }
}));

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL,
  passReqToCallback: true
}, async (req, _a, _r, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(null, false);
    const state = req.query?.state || ''; // 'staff' | 'citizen'
    const gid = profile.id;

    const found = await db.query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1)`, [email]);
    if (found.rows[0]) {
      // ensure google_id linked
      await db.query(`UPDATE users SET google_id=COALESCE(google_id,$1), provider=COALESCE(provider,'google') WHERE id=$2`,
        [gid, found.rows[0].id]);
      return done(null, found.rows[0]);
    }
    // Create citizen on the fly; staff must exist
    if (state === 'citizen') {
      const hash = await bcrypt.hash('google-oauth', 10);
      const ins = await db.query(
        `INSERT INTO users (email, password_hash, role, name, google_id, provider, status)
         VALUES ($1,$2,'CITIZEN',$3,$4,'google','ACTIVE')
         RETURNING *`,
        [email.toLowerCase(), hash, profile.displayName || email.split('@')[0], gid]
      );
      return done(null, ins.rows[0]);
    }
    return done(null, false); // staff not found
  } catch (e) { done(e); }
}));

module.exports = passport;
