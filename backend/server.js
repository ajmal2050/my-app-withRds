const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Connect using the environment variables injected by ECS & Jenkins
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST, // Connects to the AWS RDS Endpoint
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  // Required by AWS RDS PostgreSQL to resolve the 'no encryption' error
  ssl: {
    rejectUnauthorized: false
  }
});

// Retry logic to handle network latency when ECS tasks start up
const initializeDatabase = async (retries = 5) => {
  while (retries > 0) {
    try {
      // Attempt connection and verify/create the staff table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS staff (
          id SERIAL PRIMARY KEY, 
          name VARCHAR(100), 
          role VARCHAR(100)
        )
      `);
      console.log("✅ AWS RDS database connected and staff table verified!");
      return; // Exit loop on success
    } catch (err) {
      console.error(`⏳ AWS RDS not ready yet (${err.message}). Retries left: ${retries - 1}`);
      retries -= 1;
      
      if (retries === 0) {
        console.error("❌ Could not connect to AWS RDS after multiple attempts.");
        process.exit(1); // Kill container so ECS can restart/reschedule it
      }
      
      // Wait 5 seconds before retrying
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

// Start database initialization
initializeDatabase();

// API Routes
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

app.listen(5000, () => console.log('🚀 Backend running on port 5000'));
