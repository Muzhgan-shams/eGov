// src/app.js (top portion)
require('dotenv').config();
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const ejsMate = require('ejs-mate');
const passport = require('./passport');
const adminUsersRoutes = require('./routes/admin.users');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./db');

// route imports ...
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const officerRoutes = require('./routes/officer');
const apiAuth = require('./routes/api.auth');
const apiRef = require('./routes/api.ref');
const apiReq = require('./routes/api.requests');

const app = express();


const origins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOpts = {
  origin: function (origin, cb) {
    // allow same-origin (no Origin header) and listed origins
    if (!origin || origins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
};

app.use(cors(corsOpts));
// make sure preflight never hits auth middleware
app.options('*', cors(corsOpts));

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
// app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));

const isProd = process.env.NODE_ENV === 'production';

// 
if (isProd) {
  // trust the first proxy so secure cookies & IP work
  // (Render sets X-Forwarded-* headers)
  app.set('trust proxy', 1);
}

app.use(session({
  store: new pgSession({
    pool,                    // reuse  pg Pool
    tableName: 'session',     // will auto-create if missing
    createTableIfMissing: true,     // <-- auto-create table on boot
    // schemaName: 'public',        // uncomment if you use a different schema
  }),
  name: 'connect.sid',       // default; keep consistent
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: isProd ? 'lax' : 'lax',
    secure: isProd ? true : false,      // must be true on HTTPS (Render)
    maxAge: 1000 * 60 * 60 * 8          // 8 hours
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// User available to all tempaltes
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// ejs-mate view engine + views dir
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// static + routes 
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/officer', officerRoutes);
app.use('/api/auth', apiAuth);
app.use('/api', apiRef);
app.use('/api', apiReq);
app.use('/admin/users', adminUsersRoutes);


app.get('/', (req, res) => {
  if (req.user?.role === 'ADMIN') return res.redirect('/admin');
  if (req.user?.role === 'OFFICER' || req.user?.role === 'DEPT_HEAD') return res.redirect('/officer');

  // If somehow a citizen session exists on the staff app, clear it instead of redirect looping
  if (req.user) {
    const done = () => res.redirect('/login');
    return req.logout ? req.logout(done) : req.session.destroy(done);
  }
  return res.redirect('/login');
});


const port = +process.env.PORT || 3000;
app.listen(port, () => console.log(`Server: http://localhost:${port}`));
