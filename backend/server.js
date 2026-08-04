const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Connect using the environment variables injected by ECS
const pool = new Pool({
  user: process.env.DB_USER,
  host: '127.0.0.1', // Connects to the Postgres container in the same task
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

// Retry logic to handle the ECS "race condition"
const initializeDatabase = async (retries = 5) => {
  while (retries > 0) {
    try {
      // Attempt to connect and create the table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS staff (
          id SERIAL PRIMARY KEY, 
          name VARCHAR(100), 
          role VARCHAR(100)
        )
      `);
      console.log("✅ Database connected and staff table verified!");
      return; // Exit the loop because we successfully connected
    } catch (err) {
      console.error(`⏳ Database not ready yet. Retries left: ${retries - 1}`);
      retries -= 1;
      
      if (retries === 0) {
        console.error("❌ Could not connect to the database after multiple attempts.");
        process.exit(1); // Kill the container if it completely fails
      }
      
      // Wait for 3 seconds before trying again
      await new Promise(res => setTimeout(res, 3000));
    }
  }
};

// Start the database initialization
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
