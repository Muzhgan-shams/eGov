// src/passport.js
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./db');

passport.serializeUser((u, d) => d(null, { id: u.id, role: u.role }));
passport.deserializeUser(async (p, d) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, role, name, department_id FROM users WHERE id=$1 LIMIT 1`, [p.id]
    );
    const u = rows[0]; if (!u) return d(null, false);
    d(null, { id:u.id, email:u.email, role:u.role, name:u.name, departmentId:u.department_id || null });
  } catch (e) { d(e); }
});

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const { rows } = await db.query(`SELECT * FROM users WHERE email=$1 LIMIT 1`, [email]);
    const u = rows[0]; if (!u) return done(null, false, { message:'Invalid' });
    const ok = u.password_hash?.startsWith('$2') ? await bcrypt.compare(password, u.password_hash) : password === u.password_hash;
    if (!ok) return done(null, false, { message:'Invalid' });
    return done(null, u);
  } catch (e) { return done(e); }
}));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
  passReqToCallback: true   // <-- so we can read req.query.state
}, async (req, _access, _refresh, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    const gid = profile.id;
    if (!email) return done(null, false, { message:'No email from Google' });

    const { rows } = await db.query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [email]);
    const u = rows[0];

    const state = req.query?.state || ''; // 'citizen' or 'staff' or empty

    if (u) {
      // Existing user: allow login for anyone; staff/citizen decision handled by routes
      // Optionally link google_id if missing
      await db.query(`UPDATE users SET google_id = COALESCE(google_id,$1) WHERE id=$2`, [gid, u.id]);
      return done(null, u);
    }

    // No user exists:
    if (state === 'citizen') {
      // Tell the route to send user to signup; include details in "info"
      return done(null, false, {
        reason: 'NEW_GOOGLE_CITIZEN',
        email,
        name: profile.displayName || email.split('@')[0],
        googleId: gid
      });
    }

    // Staff flow but not found -> reject
    return done(null, false, { reason: 'STAFF_NOT_FOUND' });

  } catch (e) {
    return done(e);
  }
}));

module.exports = passport;




