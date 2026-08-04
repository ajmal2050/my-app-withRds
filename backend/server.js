const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: '127.0.0.1', // Updated for ECS Fargate awsvpc networking
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

// Added a catch block so the app doesn't crash if the DB is still booting
pool.query(`
  CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY, 
    name VARCHAR(100), 
    role VARCHAR(100)
  )
`).catch(err => console.error('Error creating table:', err));

app.get('/api/staff', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM staff ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff', async (req, res) => {
  try {
    const { name, role } = req.body;
    const result = await pool.query(
      'INSERT INTO staff (name, role) VALUES ($1, $2) RETURNING *',
      [name, role]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => console.log('Backend running on port 5000'));
