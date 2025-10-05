
// src/app.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const ejsMate = require('ejs-mate');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('./passport');
const { pool } = require('./db');

// routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const officerRoutes = require('./routes/officer');
const adminUsersRoutes = require('./routes/admin.users');
const apiAuth = require('./routes/api.auth');
const apiRef = require('./routes/api.ref');
const apiReq = require('./routes/api.requests');
const apiStaff = require('./routes/api.staff'); // new
const citizenRoutes = require('./routes/citizen');
const staffRegisterRoutes = require('./routes/staff.register');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// ---------- PROXY ----------
if (isProd) app.set('trust proxy', 1);

// ---------- CORS (single mount; Express 5-compatible) ----------
const allowed = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOpts = {
  origin(origin, cb) {
    // allow same-origin (no Origin header) and whitelisted origins
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOpts));
app.options('(.*)', cors(corsOpts)); // Express 5 needs (.*) instead of *

// ---------- COMMON MIDDLEWARE ----------
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'dev_cookie'));

// ---------- SESSION (staff/admin via passport) ----------
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  name: 'connect.sid',
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // If you will access from a different origin (e.g. Vercel client), you need SameSite=None + secure in prod.
    sameSite: isProd ? 'none' : 'lax',
    secure:   isProd ? true  : false,
    maxAge: 1000 * 60 * 60 * 8, // 8h
  },
}));

// ---------- PASSPORT ----------
app.use(passport.initialize());
app.use(passport.session());

// expose user to all templates
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// ---------- VIEWS / STATIC ----------
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ---------- ROUTES ----------
app.use('/', authRoutes);            // /login, /logout, staff google/local
app.use('/', staffRegisterRoutes);   // /staff/register (optional self-signup)
app.use('/citizen', citizenRoutes);  // citizen dashboard, apply, profile
app.use('/officer', officerRoutes);  // officer inbox, review
app.use('/admin', adminRoutes);      // admin dashboards
app.use('/admin/users', adminUsersRoutes);


// JSON APIs (citizen + refs + requests)
app.use('/api/auth', apiAuth);
app.use('/api', apiRef);
app.use('/api', apiReq);
app.use('/api', apiStaff); // new

// ---------- HOME ----------
app.get('/', (req, res) => {
  if (req.user?.role === 'ADMIN') return res.redirect('/admin');
  if (req.user?.role === 'OFFICER' || req.user?.role === 'DEPT_HEAD') return res.redirect('/officer');
  return res.redirect('/login');
});

// ---------- START ----------
const port = +process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on :${port}`));
