// --- path: src/routes/auth.js
const express = require('express');
const passport = require('passport');
const router = express.Router();

router.get('/login', (req, res) => {
  const staffRoles = ['ADMIN', 'OFFICER', 'DEPT_HEAD'];
  if (req.user && staffRoles.includes(req.user.role)) return res.redirect('/');

  // If it's a citizen session somehow, clear it to avoid loops
  if (req.user && !staffRoles.includes(req.user.role)) {
    const done = () => res.render('auth/login', { title: 'Sign in', err: req.query.err || 'staff_only' });
    return req.logout ? req.logout(done) : req.session.destroy(done);
  }
  res.render('auth/login', { title: 'Sign in', err: req.query.err, ok: req.query.ok });
});

// Staff email/password (passport-local)
router.post('/login',
  passport.authenticate('local', { successRedirect: '/', failureRedirect: '/login?err=1' })
);

// Staff Google
router.get('/auth/google', passport.authenticate('google', {
  scope: ['profile','email'],
  state: 'staff'
}));

router.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user) => {
    if (err) return res.redirect('/login?err=1');
    const staffRoles = ['ADMIN','OFFICER','DEPT_HEAD'];

    if (!user || !staffRoles.includes(user.role)) {
      const done = () => res.redirect('/login?err=staff_only');
      return req.logout ? req.logout(done) : req.session.destroy(done);
    }
    req.login(user, (e) => {
      if (e) return res.redirect('/login?err=1');
      return res.redirect('/');
    });
  })(req, res, next);
});

router.post('/logout', (req, res) => {
  req.logout?.(() => res.redirect('/login'));
  if (!req.logout) req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
