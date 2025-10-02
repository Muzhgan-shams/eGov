function requireAuth(req, res, next) { if (!req.user) return res.redirect('/login'); next(); }
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!roles.includes(req.user.role)) return res.status(403).send('Forbidden');
    next();
  };
}
// API uses cookie 'cid' for citizens; staff uses session—API routes check ownership per-request.
module.exports = { requireAuth, requireRole };
