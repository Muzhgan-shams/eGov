// src/routes/citizen.js
const express = require('express');
const { requireCitizen } = require('../middleware/auth');
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
router.use(requireCitizen);

const upDir = path.join(process.cwd(), 'uploads', 'docs');
fs.mkdirSync(upDir, { recursive: true });
const upload = multer({ dest: upDir, limits:{ fileSize: 10*1024*1024 } });

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT r.id, r.status, r.submitted_at, s.name AS service, d.name AS department
      FROM requests r
      JOIN services s ON s.id=r.service_id
      JOIN departments d ON d.id=s.department_id
      WHERE r.citizen_id=$1
      ORDER BY r.submitted_at DESC
    `, [req.citizen.id]);
    res.render('citizen/dashboard', { title:'Dashboard', rows });
  } catch (e) { next(e); }
});

router.get('/apply', async (_req, res, next) => {
  try {
    const svcs = await db.query(`
      SELECT s.id, s.name, s.fee_cents, d.name AS department
      FROM services s JOIN departments d ON d.id=s.department_id
      ORDER BY d.name, s.name
    `);
    res.render('citizen/apply', { title:'Apply', services: svcs.rows });
  } catch (e) { next(e); }
});
router.post('/apply', async (req,res,next)=>{
  try{
    const { serviceId, notes } = req.body;
    if(!serviceId) return res.redirect('/citizen/apply?err=missing');

    const details = notes ? { notes } : {};
    await db.query(
      `INSERT INTO requests (citizen_id, service_id, status, data)
       VALUES ($1,$2,'SUBMITTED',$3::jsonb)`,
      [req.citizen.id, serviceId, JSON.stringify(details)]
    );

    res.redirect('/citizen');
  }catch(e){ next(e); }
});

router.get('/requests/:id', async (req, res, next) => {
  try {
    const q = await db.query(`
      SELECT r.*, s.name AS service, d.name AS department
      FROM requests r
      JOIN services s ON s.id=r.service_id
      JOIN departments d ON d.id=s.department_id
      WHERE r.id=$1 AND r.citizen_id=$2`, [req.params.id, req.citizen.id]);
    const r = q.rows[0]; if(!r) return res.redirect('/citizen');
    const docs = await db.query(`SELECT * FROM documents WHERE request_id=$1 ORDER BY uploaded_at DESC`, [r.id]);
    const pays = await db.query(`SELECT * FROM payments WHERE request_id=$1 ORDER BY paid_at DESC`, [r.id]);
    res.render('citizen/request-view', { title:`Request #${r.id}`, r, docs:docs.rows, pays:pays.rows });
  } catch (e) { next(e); }
});

router.post('/requests/:id/doc', upload.single('file'), async (req, res, next) => {
  try {
    await db.query(
      `INSERT INTO documents (request_id, file_name, mime_type, storage_key, uploaded_by)
       SELECT $1,$2,$3,$4,$5 WHERE EXISTS (SELECT 1 FROM requests WHERE id=$1 AND citizen_id=$5)`,
      [req.params.id, req.file.originalname, req.file.mimetype, req.file.filename, req.citizen.id]
    );
    res.redirect(`/citizen/requests/${req.params.id}`);
  } catch (e) { next(e); }
});

router.post('/requests/:id/pay', async (req, res, next) => {
  try {
    const q = await db.query(`
      SELECT r.id, s.fee_cents FROM requests r
      JOIN services s ON s.id=r.service_id
      WHERE r.id=$1 AND r.citizen_id=$2`, [req.params.id, req.citizen.id]);
    const row = q.rows[0]; if(!row) return res.redirect('/citizen');
    await db.query(
      `INSERT INTO payments (request_id, amount_cents, status, provider, txn_ref, paid_at)
       VALUES ($1,$2,'PAID','FAKE',$3, now())`,
      [row.id, row.fee_cents || 0, 'SIM-'+Date.now()]
    );
    res.redirect(`/citizen/requests/${row.id}`);
  } catch (e) { next(e); }
});

const avatarDir = path.join(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });
const uploadAvatar = multer({ dest: avatarDir, limits: { fileSize: 5*1024*1024 } });

router.get('/profile', (req,res)=> res.render('citizen/profile', { title:'My Profile' }));
router.post('/profile', uploadAvatar.single('avatar'), async (req,res,next)=>{
  try{
    const { name, phone, address, date_of_birth, national_id } = req.body;
    if (req.file) {
      await db.query(`UPDATE users SET avatar_url=$1 WHERE id=$2`, [`/uploads/avatars/${req.file.filename}`, req.citizen.id]);
    }
    await db.query(
      `UPDATE users SET name=$1, phone=$2, address=$3, date_of_birth=$4, national_id=$5 WHERE id=$6`,
      [name, phone || null, address || null, date_of_birth || null, national_id || null, req.citizen.id]
    );
    res.redirect('/citizen/profile');
  }catch(e){ next(e); }
});

router.post('/logout', (req,res)=>{
  res.clearCookie('cid', { sameSite:'lax', secure: process.env.NODE_ENV==='production' });
  res.redirect('/login');
});

module.exports = router;
