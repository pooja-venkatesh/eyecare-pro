require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    // Allow all origins in dev (file://, localhost:*, 127.0.0.1:*)
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve frontend static files ───────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth.routes'));
app.use('/api/user',     require('./routes/user.routes'));
app.use('/api/sessions', require('./routes/session.routes'));
app.use('/api/stats',    require('./routes/stats.routes'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ── Catch-all: serve frontend ─────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 EyeCare Pro server running at http://localhost:${PORT}`);
  console.log(`📁 Serving frontend from ../frontend`);
  console.log(`🛢️  MySQL database: ${process.env.DB_NAME || 'eyecare_pro'}\n`);
});
