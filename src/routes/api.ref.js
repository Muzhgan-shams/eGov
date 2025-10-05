
const express = require('express');
const db = require('../db');

const router = express.Router();

// list departments (id, name)
router.get('/departments', async (_req, res) => {
  const { rows } = await db.query(`SELECT id, name FROM departments ORDER BY name`);
  res.json(rows);
});

// list services (optionally filter by departmentId)
router.get('/services', async (req, res) => {
  const { departmentId } = req.query;
  const p = []; let where = '';
  if (departmentId) { where = 'WHERE department_id = $1'; p.push(departmentId); }
  const { rows } = await db.query(
    `SELECT id, department_id, name, fee_cents
     FROM services ${where} ORDER BY name`, p
  );
  res.json(rows);
});

module.exports = router;
