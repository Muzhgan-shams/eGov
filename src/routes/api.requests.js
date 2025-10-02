const express = require('express');
const db = require('../db');
const multer = require('multer');
const path = require('path');

const router = express.Router();
const upload = multer({ dest: path.join(process.cwd(), 'uploads'), limits:{ fileSize: 10*1024*1024 }});

async function getCitizen(req) {
  const cid = req.cookies?.cid;
  if (!cid) return null;
  const { rows } = await db.query(`SELECT id, role FROM users WHERE id=$1`, [cid]);
  const u = rows[0]; return (u && u.role === 'CITIZEN') ? u : null;
}

router.post('/requests', async (req, res) => {
  const me = await getCitizen(req); if (!me) return res.status(401).json({ error:'Unauthenticated' });
  const { serviceId, data } = req.body;
  const { rows } = await db.query(
    `INSERT INTO requests (citizen_id, service_id, status, data)
     VALUES ($1,$2,'SUBMITTED',$3) RETURNING *`,
    [me.id, serviceId, data || null]
  );
  res.status(201).json(rows[0]);
});

router.get('/requests', async (req, res) => {
  const me = await getCitizen(req); if (!me) return res.status(401).json({ error:'Unauthenticated' });
  const { status } = req.query;
  const p = [me.id]; let w = 'WHERE r.citizen_id=$1';
  if (status) { p.push(status); w += ` AND r.status=$${p.length}`; }
  const { rows } = await db.query(`
    SELECT r.*, s.name AS service
    FROM requests r JOIN services s ON s.id=r.service_id
    ${w}
    ORDER BY r.submitted_at DESC
  `, p);
  res.json(rows);
});

router.get('/requests/:id', async (req, res) => {
  const me = await getCitizen(req); if (!me) return res.status(401).json({ error:'Unauthenticated' });
  const { rows } = await db.query(`
    SELECT r.*, s.name AS service
    FROM requests r JOIN services s ON s.id=r.service_id
    WHERE r.id=$1 AND r.citizen_id=$2 LIMIT 1
  `, [req.params.id, me.id]);
  const item = rows[0]; if (!item) return res.status(404).json({ error:'Not found' });
  res.json(item);
});

router.post('/requests/:id/documents', upload.single('file'), async (req, res) => {
  const me = await getCitizen(req); if (!me) return res.status(401).json({ error:'Unauthenticated' });
  const owns = await db.query(`SELECT 1 FROM requests WHERE id=$1 AND citizen_id=$2`, [req.params.id, me.id]);
  if (!owns.rows[0]) return res.status(404).json({ error:'Not found' });
  await db.query(
    `INSERT INTO documents (request_id, file_name, mime_type, storage_key, uploaded_by)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.params.id, req.file.originalname, req.file.mimetype, req.file.filename, me.id]
  );
  res.status(201).json({ ok:true });
});

router.post('/requests/:id/payments', async (req, res) => {
  const me = await getCitizen(req); if (!me) return res.status(401).json({ error:'Unauthenticated' });
  const { rows } = await db.query(`
    SELECT r.id, s.fee_cents FROM requests r JOIN services s ON s.id=r.service_id
    WHERE r.id=$1 AND r.citizen_id=$2`, [req.params.id, me.id]);
  if (!rows[0]) return res.status(404).json({ error:'Not found' });
  const amount = rows[0].fee_cents || 0;
  const pay = await db.query(`
    INSERT INTO payments (request_id, amount_cents, status, provider, txn_ref, paid_at)
    VALUES ($1,$2,'PAID','FAKE',$3, now()) RETURNING *`,
    [req.params.id, amount, 'SIM-'+Date.now()]
  );
  res.status(201).json(pay.rows[0]);
});

module.exports = router;
