const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/departments', async (_req, res) => {
  const { rows } = await db.query(`SELECT id, name, descr FROM departments ORDER BY name`);
  res.json(rows);
});

router.get('/services', async (req, res) => {
  const { departmentId } = req.query;
  const p = []; let w = '';
  if (departmentId) { w = 'WHERE department_id=$1'; p.push(departmentId); }
  const { rows } = await db.query(
    `SELECT id, department_id, name, descr, fee_cents FROM services ${w} ORDER BY name`, p
  );
  res.json(rows);
});

module.exports = router;
