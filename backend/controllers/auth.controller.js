const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// POST /api/auth/register
exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    // Check existing user
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hashed]
    );

    const token = jwt.sign(
      { id: result.insertId, email, name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: { id: result.insertId, name, email }
    });

  } catch (err) {
    console.error('Register error:', err);
    const msg = (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')
      ? 'Database not reachable. Please ensure MySQL is running.'
      : 'Server error. Please try again.';
    res.status(500).json({ success: false, message: msg });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required.' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email, health_score: user.health_score }
    });

  } catch (err) {
    console.error('Login error:', err);
    const msg = (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')
      ? 'Database not reachable. Please ensure MySQL is running.'
      : 'Server error. Please try again.';
    res.status(500).json({ success: false, message: msg });
  }
};
