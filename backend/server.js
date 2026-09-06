const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// All connection details come from environment variables.
// This is intentional: in Kubernetes these will come from a
// ConfigMap (non-secret values) and a Secret (credentials).
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'taskflow',
  password: process.env.DB_PASSWORD || 'taskflow',
  database: process.env.DB_NAME || 'taskflow',
});

const PORT = process.env.PORT || 4000;

// Create the table if it doesn't exist yet. Keeps the project
// self-contained -- no separate migration step needed.
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

// Liveness/readiness endpoint -- useful as-is for K8s
// livenessProbe / readinessProbe checks later.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'taskflow-backend' });
});

app.get('/api/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO tasks (title) VALUES ($1) RETURNING *',
      [title.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { done } = req.body;
  try {
    const result = await pool.query(
      'UPDATE tasks SET done = $1 WHERE id = $2 RETURNING *',
      [done, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Retry DB connection on startup since in K8s the database
// pod may not be ready the instant this service starts.
async function start() {
  let connected = false;
  while (!connected) {
    try {
      await initDb();
      connected = true;
    } catch (err) {
      console.log('Waiting for database...', err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  app.listen(PORT, () => {
    console.log(`TaskFlow backend listening on port ${PORT}`);
  });
}

start();
