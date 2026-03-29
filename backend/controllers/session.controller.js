const db = require('../config/db');

// POST /api/sessions — save a scan result
exports.createSession = async (req, res) => {
  const { blink_rate, duration_sec, ear_avg, status } = req.body;

  if (blink_rate === undefined) {
    return res.status(400).json({ success: false, message: 'blink_rate is required.' });
  }

  const blinkStatus = status || (blink_rate < 12 ? 'low' : blink_rate <= 18 ? 'normal' : 'high');

  try {
    const [result] = await db.query(
      'INSERT INTO scan_sessions (user_id, blink_rate, duration_sec, ear_avg, status) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, blink_rate, duration_sec || 15, ear_avg || null, blinkStatus]
    );

    // Update weekly_stats scans count
    await upsertWeeklyStats(req.user.id, { scans: 1, blink_rate });

    res.status(201).json({
      success: true,
      message: 'Scan saved.',
      session_id: result.insertId
    });
  } catch (err) {
    console.error('createSession error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/sessions — get user's scan history
exports.getSessions = async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const [rows] = await db.query(
      'SELECT * FROM scan_sessions WHERE user_id = ? ORDER BY scanned_at DESC LIMIT ?',
      [req.user.id, limit]
    );
    res.json({ success: true, sessions: rows });
  } catch (err) {
    console.error('getSessions error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

async function upsertWeeklyStats(userId, { scans = 0, blink_rate = 0 }) {
  const monday = getMonday(new Date());
  try {
    await db.query(`
      INSERT INTO weekly_stats (user_id, week_start, total_scans, avg_blink_rate)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_scans = total_scans + VALUES(total_scans),
        avg_blink_rate = (avg_blink_rate + VALUES(avg_blink_rate)) / 2
    `, [userId, monday, scans, blink_rate]);
  } catch (e) {
    // Non-critical, just log
    console.error('upsertWeeklyStats error:', e.message);
  }
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split('T')[0];
}
