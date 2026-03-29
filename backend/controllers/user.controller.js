const db = require('../config/db');

// GET /api/user/profile
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, avatar_url, health_score, break_streak, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PUT /api/user/profile
exports.updateProfile = async (req, res) => {
  const { name, avatar_url } = req.body;
  try {
    await db.query(
      'UPDATE users SET name = ?, avatar_url = ? WHERE id = ?',
      [name || req.user.name, avatar_url || null, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated.' });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PUT /api/user/health-score
exports.updateHealthScore = async (req, res) => {
  const { score } = req.body;
  try {
    await db.query('UPDATE users SET health_score = ? WHERE id = ?', [score, req.user.id]);
    res.json({ success: true, message: 'Health score updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
