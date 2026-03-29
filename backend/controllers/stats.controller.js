const db = require('../config/db');

// POST /api/stats/screentime — log/update screen time for today
exports.logScreenTime = async (req, res) => {
  const { total_secs, breaks_taken } = req.body;
  const today = new Date().toISOString().split('T')[0];

  try {
    await db.query(`
      INSERT INTO screen_time_logs (user_id, log_date, total_secs, breaks_taken)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_secs   = VALUES(total_secs),
        breaks_taken = VALUES(breaks_taken)
    `, [req.user.id, today, total_secs || 0, breaks_taken || 0]);

    // Also update weekly_stats
    const monday = getMonday(new Date());
    const hours = (total_secs || 0) / 3600;
    await db.query(`
      INSERT INTO weekly_stats (user_id, week_start, total_screen_h, total_breaks)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_screen_h = VALUES(total_screen_h),
        total_breaks   = VALUES(total_breaks)
    `, [req.user.id, monday, hours, breaks_taken || 0]);

    res.json({ success: true, message: 'Screen time logged.' });
  } catch (err) {
    console.error('logScreenTime error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/stats/dashboard — all data for dashboard
exports.getDashboard = async (req, res) => {
  const userId = req.user.id;
  const today  = new Date().toISOString().split('T')[0];

  try {
    // Today's screen time
    const [[todayLog]] = await db.query(
      'SELECT total_secs, breaks_taken FROM screen_time_logs WHERE user_id = ? AND log_date = ?',
      [userId, today]
    );

    // Recent scans (last 5)
    const [recentScans] = await db.query(
      'SELECT blink_rate, status, scanned_at FROM scan_sessions WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 5',
      [userId]
    );

    // Avg blink rate (last 7 scans)
    const [[blinkAvg]] = await db.query(
      'SELECT AVG(blink_rate) as avg FROM scan_sessions WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 7',
      [userId]
    );

    // Weekly screen time (last 7 days)
    const [weeklyLogs] = await db.query(`
      SELECT log_date, total_secs, breaks_taken
      FROM screen_time_logs
      WHERE user_id = ?
        AND log_date >= DATE_SUB(?, INTERVAL 6 DAY)
      ORDER BY log_date ASC
    `, [userId, today]);

    // Badges count
    const [[badgeCount]] = await db.query(
      'SELECT COUNT(*) as count FROM user_badges WHERE user_id = ?',
      [userId]
    );

    // User health score
    const [[userRow]] = await db.query(
      'SELECT health_score, break_streak FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      success: true,
      dashboard: {
        today: {
          screen_time_secs: todayLog?.total_secs || 0,
          breaks_taken:     todayLog?.breaks_taken || 0
        },
        avg_blink_rate: blinkAvg?.avg ? Math.round(blinkAvg.avg) : null,
        recent_scans:   recentScans,
        weekly_logs:    weeklyLogs,
        badges_earned:  badgeCount?.count || 0,
        health_score:   userRow?.health_score || 85,
        break_streak:   userRow?.break_streak || 0
      }
    });
  } catch (err) {
    console.error('getDashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/stats/weekly
exports.getWeekly = async (req, res) => {
  const userId = req.user.id;
  const monday = getMonday(new Date());

  try {
    const [[row]] = await db.query(
      'SELECT * FROM weekly_stats WHERE user_id = ? AND week_start = ?',
      [userId, monday]
    );

    // Also get per-day breakdown for this week
    const [days] = await db.query(`
      SELECT log_date, total_secs, breaks_taken
      FROM screen_time_logs
      WHERE user_id = ? AND log_date >= ?
      ORDER BY log_date ASC
    `, [userId, monday]);

    const [blinkDays] = await db.query(`
      SELECT DATE(scanned_at) as scan_date, AVG(blink_rate) as avg_blink
      FROM scan_sessions
      WHERE user_id = ? AND scanned_at >= ?
      GROUP BY DATE(scanned_at)
      ORDER BY scan_date ASC
    `, [userId, monday]);

    res.json({
      success: true,
      weekly: {
        summary: row || {},
        daily_screen_time: days,
        daily_blink_rates: blinkDays
      }
    });
  } catch (err) {
    console.error('getWeekly error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/badges
exports.getBadges = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT badge_key, badge_name, badge_icon, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC',
      [req.user.id]
    );
    res.json({ success: true, badges: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/badges
exports.saveBadge = async (req, res) => {
  const { badge_key, badge_name, badge_icon } = req.body;
  if (!badge_key) return res.status(400).json({ success: false, message: 'badge_key required.' });

  try {
    await db.query(`
      INSERT IGNORE INTO user_badges (user_id, badge_key, badge_name, badge_icon)
      VALUES (?, ?, ?, ?)
    `, [req.user.id, badge_key, badge_name || '', badge_icon || '']);

    res.json({ success: true, message: 'Badge saved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/alerts
exports.saveAlert = async (req, res) => {
  const { type, severity, message } = req.body;
  try {
    await db.query(
      'INSERT INTO alerts (user_id, type, severity, message) VALUES (?, ?, ?, ?)',
      [req.user.id, type, severity || 'low', message || '']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

function getMonday(d) {
  const date = new Date(d);
  const day  = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split('T')[0];
}
