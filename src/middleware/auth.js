// src/middleware/auth.js
function requireAuth(req, res, next) {
  const ok = req.isAuthenticated ? req.isAuthenticated() : !!req.user;
  if (!ok) return res.redirect('/login?err=auth');
  if (req.user.status && req.user.status !== 'ACTIVE') return res.status(403).send('Account not active');
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    const ok = req.isAuthenticated ? req.isAuthenticated() : !!req.user;
    if (!ok) return res.redirect('/login?err=auth');
    if (!roles.includes(req.user.role)) return res.status(403).send('Forbidden');
    next();
  };
}
// citizen guard (cookie-based)
function requireCitizen(req, res, next) {
  if (!req.citizen) return res.redirect('/login?err=auth');
  next();
}
module.exports = { requireAuth, requireRole, requireCitizen };
