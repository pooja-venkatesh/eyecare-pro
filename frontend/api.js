/* ============================================================
   EyeCare Pro — API Integration Module
   Handles auth guard, token management, and backend sync
   ============================================================ */

const API_BASE = 'http://localhost:3001/api';

// ── Auth Guard ───────────────────────────────────────────────
(function authGuard() {
  const token = localStorage.getItem('eyecare_token');
  if (!token) {
    window.location.href = 'login.html';
  }
})();

// ── Token helper ─────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('eyecare_token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

// ── Logout ───────────────────────────────────────────────────
function apiLogout() {
  localStorage.removeItem('eyecare_token');
  localStorage.removeItem('eyecare_user');
  window.location.href = 'login.html';
}

// ── Load user profile into header ────────────────────────────
async function loadUserProfile() {
  const cached = localStorage.getItem('eyecare_user');
  if (cached) {
    const user = JSON.parse(cached);
    setUserUI(user);
  }

  try {
    const res = await fetch(`${API_BASE}/user`, { headers: authHeaders() });
    const data = await res.json();

    if (res.status === 401 || res.status === 403) {
      apiLogout(); return;
    }

    if (data.success) {
      setUserUI(data.user);
      localStorage.setItem('eyecare_user', JSON.stringify(data.user));

      // Update health score from server
      if (data.user.health_score) {
        document.getElementById('healthScore').innerText = data.user.health_score;
      }
      if (data.user.break_streak) {
        document.getElementById('breakStreak').innerText = data.user.break_streak;
      }
    }
  } catch (err) {
    console.warn('Could not load profile (offline?):', err.message);
  }
}

function setUserUI(user) {
  const nameEl = document.getElementById('userName');
  const avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = user.name || 'User';
  if (avatarEl) avatarEl.textContent = (user.name || 'U')[0].toUpperCase();
}

// ── Load dashboard data from server ──────────────────────────
async function loadDashboardData() {
  try {
    const res = await fetch(`${API_BASE}/stats/dashboard`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) return;

    const d = data.dashboard;

    // Restore blink rate
    if (d.avg_blink_rate) {
      document.getElementById('avgBlinkRate').innerText = `${d.avg_blink_rate} bpm`;
    }

    // Restore breaks
    if (d.today.breaks_taken) {
      weeklyData.breaks = d.today.breaks_taken;
      document.getElementById('breaksTaken').innerText = weeklyData.breaks;
    }

    // Health score
    if (d.health_score) {
      document.getElementById('healthScore').innerText = d.health_score;
    }

    // Restore weekly chart data from server
    if (d.weekly_logs && d.weekly_logs.length > 0) {
      d.weekly_logs.forEach(log => {
        const date = new Date(log.log_date);
        const dayIdx = date.getDay() === 0 ? 6 : date.getDay() - 1;
        weeklyData.screenTime[dayIdx] = (log.total_secs || 0) / 3600;
      });
      screenTimeChart.data.datasets[0].data = [...weeklyData.screenTime];
      screenTimeChart.update();
    }

    // Restore scan history
    if (d.recent_scans && d.recent_scans.length > 0) {
      scanHistory = d.recent_scans.map(s => ({
        time: new Date(s.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        rate: Math.round(s.blink_rate),
        status: s.status
      }));
      updateScanHistory();
    }

    console.log('✅ Dashboard data loaded from server');
  } catch (err) {
    console.warn('Could not load dashboard (offline?):', err.message);
  }
}

// ── Save scan to backend ──────────────────────────────────────
async function apiSaveScan(blink_rate, status) {
  try {
    await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ blink_rate, duration_sec: 15, status })
    });
  } catch (err) {
    console.warn('Could not save scan:', err.message);
  }
}

// ── Save screen time to backend every 60s ────────────────────
async function apiSyncScreenTime() {
  try {
    await fetch(`${API_BASE}/stats/screentime`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        total_secs: seconds,
        breaks_taken: weeklyData.breaks
      })
    });
  } catch (err) {
    console.warn('Could not sync screen time:', err.message);
  }
}

// ── Save badge to backend ─────────────────────────────────────
async function apiSaveBadge(badge_key, badge_name, badge_icon) {
  try {
    await fetch(`${API_BASE}/stats/badges`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ badge_key, badge_name, badge_icon })
    });
  } catch (err) {
    console.warn('Could not save badge:', err.message);
  }
}

// ── Save ML alert to backend ──────────────────────────────────
async function apiSaveAlert(type, severity, message) {
  try {
    await fetch(`${API_BASE}/stats/alerts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ type, severity, message })
    });
  } catch (err) {
    // silent
  }
}

// ── Patch: hook ML alert to also save to backend ─────────────
const _originalCheckMLAlerts = window.checkMLAlerts;
if (_originalCheckMLAlerts) {
  window.checkMLAlerts = function (distance, posture, redness) {
    _originalCheckMLAlerts(distance, posture, redness);
    if (distance < 40) apiSaveAlert('distance', 'high', 'Too close to screen');
    if (redness === 'Tired Eyes') apiSaveAlert('redness', 'medium', 'Eye fatigue detected');
  };
}

// ── Sync screen time every 60 seconds ────────────────────────
setInterval(apiSyncScreenTime, 60000);

// ── Add user chip styles dynamically ─────────────────────────
const style = document.createElement('style');
style.textContent = `
  .user-chip {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--glass-bg);
    border: 1px solid var(--border-color);
    border-radius: 30px;
    padding: 0.4rem 1rem 0.4rem 0.4rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .user-avatar {
    width: 28px; height: 28px;
    background: linear-gradient(135deg, #e94560, #f5a7b8);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.85rem;
    font-weight: 800;
    color: white;
  }
  .btn-logout {
    background: var(--glass-bg);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    width: 36px; height: 36px;
    border-radius: 10px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.3s;
    font-size: 0.95rem;
  }
  .btn-logout:hover {
    background: rgba(239,68,68,0.1);
    border-color: #ef4444;
    color: #ef4444;
  }
`;
document.head.appendChild(style);

// ── Init on load ──────────────────────────────────────────────
window.addEventListener('load', async () => {
  await loadUserProfile();
  await loadDashboardData();
  console.log('🔗 API module initialized');
});
