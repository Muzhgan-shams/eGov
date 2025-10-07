// --- keep your existing requires ---
require('dotenv').config();
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const ejsMate = require('ejs-mate');

const passport = require('./passport');
const { pool, query } = require('./db');

const authRoutes = require('./routes/auth');
const citizenRoutes = require('./routes/citizen');
const officerRoutes = require('./routes/officer');
const adminRoutes = require('./routes/admin');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET || 'dev_secret';
if (isProd) app.set('trust proxy', 1);

// ---------- CORE MIDDLEWARE (order matters) ----------
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(secret)); // <-- signed cookies support

app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  name: 'connect.sid',
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly:true, sameSite:'lax', secure:isProd, maxAge: 1000*60*60*8 }
}));
app.use(passport.initialize());
app.use(passport.session());

// ---------- ATTACH CITIZEN/LOCALS (this was missing) ----------
app.use(async (req, res, next) => {
  // start with staff user, if any
  res.locals.user = req.user || null;

  // if not staff, try citizen cookie
  if (!req.user) {
    const cid = req.signedCookies?.cid || req.cookies?.cid;
    if (cid) {
      try {
        const { rows } = await query(
          `SELECT id, email, role, name, avatar_url FROM users WHERE id=$1 AND role='CITIZEN'`,
          [cid]
        );
        if (rows[0]) {
          req.citizen = rows[0];
          res.locals.user = rows[0]; // so navbar shows citizen too
        }
      } catch (_) { /* ignore */ }
    }
  }

  // defaults so EJS never throws
  res.locals.hideNav = res.locals.hideNav ?? false;
  res.locals.ok = res.locals.ok ?? null;
  res.locals.err = res.locals.err ?? null;
  next();
});

// ---------- (optional) DEBUG LOGGER — put AFTER attach so values are accurate ----------
app.use((req, res, next) => {
  console.log('[', req.method, req.path, ']', 'user=', !!req.user, 'citizen=', !!req.citizen);
  next();
});

// ---------- VIEWS / STATIC ----------
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ---------- ROUTES ----------
app.use('/', authRoutes);
app.use('/citizen', citizenRoutes);
app.use('/officer', officerRoutes);
app.use('/admin', adminRoutes);

// ---------- SMART HOME ----------
app.get('/', (req, res) => {
  if (req.user) {
    if (req.user.role === 'ADMIN') return res.redirect('/admin');
    if (['OFFICER','DEPT_HEAD'].includes(req.user.role)) return res.redirect('/officer');
  }
  if (req.citizen) return res.redirect('/citizen');
  return res.redirect('/login');
});

const port = +process.env.PORT || 3000;
app.listen(port, () => console.log(`http://localhost:${port}`));
