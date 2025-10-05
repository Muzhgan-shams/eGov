
// src/middleware/auth.js

/**
 * Helper: normalize allowed roles input.
 * Accepts: 'ADMIN' | ['ADMIN','OFFICER'] | ('ADMIN','OFFICER')
 */
function normalizeRoles(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return [input];
  // if called as requireRole('A','B'), args land in ...roles
  if (arguments.length > 1) return Array.from(arguments);
  return []; // no restriction
}

/** View middleware: redirects to /login when unauthenticated */
function requireAuth(req, res, next) {
  // prefer passport's method if present
  const authed = req.isAuthenticated ? req.isAuthenticated() : !!req.user;
  if (!authed) return res.redirect('/login?err=auth');
  // optional: block non-active staff accounts
  if (req.user && ['OFFICER','DEPT_HEAD','ADMIN'].includes(req.user.role)) {
    if (req.user.status && req.user.status !== 'ACTIVE') {
      return res.status(403).render('auth/login', { title: 'Login', err: 'not_active' });
    }
  }
  next();
}

/** View middleware: role gate (redirects or 403 page) */
function requireRole(/* ...roles OR rolesArray */) {
  const allowed = normalizeRoles.apply(null, arguments);
  return (req, res, next) => {
    const authed = req.isAuthenticated ? req.isAuthenticated() : !!req.user;
    if (!authed) return res.redirect('/login?err=auth');

    if (req.user && ['OFFICER','DEPT_HEAD','ADMIN'].includes(req.user.role)) {
      if (req.user.status && req.user.status !== 'ACTIVE') {
        return res.status(403).render('auth/login', { title: 'Login', err: 'not_active' });
      }
    }

    if (allowed.length && (!req.user || !allowed.includes(req.user.role))) {
      return res.status(403).send('Forbidden');
    }
    next();
  };
}

/** JSON middleware versions (for /api routes) */

function requireAuthJson(req, res, next) {
  const authed = req.isAuthenticated ? req.isAuthenticated() : !!req.user;
  if (!authed) return res.status(401).json({ error: 'Unauthenticated' });

  if (req.user && ['OFFICER','DEPT_HEAD','ADMIN'].includes(req.user.role)) {
    if (req.user.status && req.user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account not active' });
    }
  }
  next();
}

function requireRoleJson(/* ...roles OR rolesArray */) {
  const allowed = normalizeRoles.apply(null, arguments);
  return (req, res, next) => {
    const authed = req.isAuthenticated ? req.isAuthenticated() : !!req.user;
    if (!authed) return res.status(401).json({ error: 'Unauthenticated' });

    if (req.user && ['OFFICER','DEPT_HEAD','ADMIN'].includes(req.user.role)) {
      if (req.user.status && req.user.status !== 'ACTIVE') {
        return res.status(403).json({ error: 'Account not active' });
      }
    }

    if (allowed.length && (!req.user || !allowed.includes(req.user.role))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireAuthJson,
  requireRoleJson,
};
