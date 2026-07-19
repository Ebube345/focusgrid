const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 8080;

// Supabase configuration detection
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

let db = null;

if (isSupabaseConfigured) {
  console.log('Supabase detected. Running in Cloud Mode (API: ' + SUPABASE_URL + ')');
} else {
  // Use /tmp for SQLite database file if running on Vercel (read-only file system)
  const isVercel = process.env.VERCEL || process.env.NOW_REGION;
  const DB_FILE = isVercel ? '/tmp/database.sqlite' : path.join(__dirname, 'database.sqlite');

  console.log('SQLite fallback detected. Running in Local Mode (DB: ' + DB_FILE + ')');
  db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to SQLite database.');
      initializeDb();
    }
  });
}

// Setup database tables (for SQLite fallback mode)
function initializeDb() {
  if (!db) return;
  db.serialize(() => {
    // Tasks table
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        quadrant TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        dueDate TEXT,
        tag TEXT,
        notes TEXT,
        createdAt TEXT
      )
    `, (err) => {
      if (err) console.error('Error creating tasks table:', err.message);
    });

    // Settings table (for theme, lifetimeCompleted)
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `, (err) => {
      if (err) console.error('Error creating settings table:', err.message);
    });
  });
}

// Helper headers for Supabase API requests
function getSupabaseHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
}

// Middlewares
app.use(express.json());

// --- Serve Static Assets ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/favicon.svg', (req, res) => {
  res.sendFile(path.join(__dirname, 'favicon.svg'));
});

app.get('/favicon.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'favicon.png'));
});

app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});

// --- API Endpoints ---

// GET: All tasks
app.get('/api/tasks', async (req, res) => {
  if (isSupabaseConfigured) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?order=createdAt.asc`, {
        headers: getSupabaseHeaders()
      });
      if (!response.ok) {
        throw new Error(`Supabase error: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error('Supabase GET tasks error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else {
    db.all('SELECT * FROM tasks ORDER BY createdAt ASC', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      // Map SQLite integer complete (0/1) to javascript boolean
      const tasks = rows.map(row => ({
        ...row,
        completed: row.completed === 1
      }));
      res.json(tasks);
    });
  }
});

// POST: Create a task
app.post('/api/tasks', async (req, res) => {
  const { id, title, quadrant, completed, dueDate, tag, notes, createdAt } = req.body;
  if (!title || !quadrant) {
    return res.status(400).json({ error: 'Title and Quadrant are required.' });
  }

  if (isSupabaseConfigured) {
    try {
      const taskData = {
        id,
        title: title.trim(),
        quadrant,
        completed: !!completed,
        dueDate: dueDate || '',
        tag: tag || '',
        notes: notes || '',
        createdAt: createdAt || new Date().toISOString()
      };
      const response = await fetch(`${SUPABASE_URL}/rest/v1/tasks`, {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(),
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(taskData)
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase error: ${response.statusText} - ${errText}`);
      }
      res.status(201).json({ message: 'Task created successfully', taskId: id });
    } catch (err) {
      console.error('Supabase POST task error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else {
    const query = `
      INSERT INTO tasks (id, title, quadrant, completed, dueDate, tag, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      id,
      title.trim(),
      quadrant,
      completed ? 1 : 0,
      dueDate || '',
      tag || '',
      notes || '',
      createdAt || new Date().toISOString()
    ];

    db.run(query, params, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: 'Task created successfully', taskId: id });
    });
  }
});

// PUT: Update a task
app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, quadrant, completed, dueDate, tag, notes } = req.body;

  if (!title || !quadrant) {
    return res.status(400).json({ error: 'Title and Quadrant are required.' });
  }

  if (isSupabaseConfigured) {
    try {
      const taskData = {
        title: title.trim(),
        quadrant,
        completed: !!completed,
        dueDate: dueDate || '',
        tag: tag || '',
        notes: notes || ''
      };
      const response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${id}`, {
        method: 'PATCH',
        headers: getSupabaseHeaders(),
        body: JSON.stringify(taskData)
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase error: ${response.statusText} - ${errText}`);
      }
      res.json({ message: 'Task updated successfully' });
    } catch (err) {
      console.error('Supabase PATCH task error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else {
    const query = `
      UPDATE tasks
      SET title = ?, quadrant = ?, completed = ?, dueDate = ?, tag = ?, notes = ?
      WHERE id = ?
    `;
    const params = [
      title.trim(),
      quadrant,
      completed ? 1 : 0,
      dueDate || '',
      tag || '',
      notes || '',
      id
    ];

    db.run(query, params, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ message: 'Task updated successfully' });
    });
  }
});

// DELETE: Single task
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;

  if (isSupabaseConfigured) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${id}`, {
        method: 'DELETE',
        headers: getSupabaseHeaders()
      });
      if (!response.ok) {
        throw new Error(`Supabase error: ${response.statusText}`);
      }
      res.json({ message: 'Task deleted successfully' });
    } catch (err) {
      console.error('Supabase DELETE task error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else {
    db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ message: 'Task deleted successfully' });
    });
  }
});

// DELETE: All tasks
app.delete('/api/tasks', async (req, res) => {
  if (isSupabaseConfigured) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=not.is.null`, {
        method: 'DELETE',
        headers: getSupabaseHeaders()
      });
      if (!response.ok) {
        throw new Error(`Supabase error: ${response.statusText}`);
      }
      res.json({ message: 'All tasks deleted successfully' });
    } catch (err) {
      console.error('Supabase DELETE all tasks error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else {
    db.run('DELETE FROM tasks', [], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'All tasks deleted successfully', count: this.changes });
    });
  }
});

// GET: Settings
app.get('/api/settings', async (req, res) => {
  if (isSupabaseConfigured) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
        headers: getSupabaseHeaders()
      });
      if (!response.ok) {
        throw new Error(`Supabase error: ${response.statusText}`);
      }
      const data = await response.json();
      const settings = {};
      data.forEach(row => {
        settings[row.key] = row.value;
      });
      res.json(settings);
    } catch (err) {
      console.error('Supabase GET settings error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else {
    db.all('SELECT key, value FROM settings', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const settings = {};
      rows.forEach(row => {
        settings[row.key] = row.value;
      });
      res.json(settings);
    });
  }
});

// POST: Save a setting
app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Key is required.' });
  }

  if (isSupabaseConfigured) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ key, value: String(value) })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase error: ${response.statusText} - ${errText}`);
      }
      res.json({ message: 'Setting saved successfully' });
    } catch (err) {
      console.error('Supabase POST setting error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else {
    db.run('REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Setting saved successfully' });
    });
  }
});

// Start Server
if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server is running at http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
