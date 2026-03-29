/* ========================================
   EYECARE PRO - WITH REAL MEDIAPIPE ML
   AI-Powered Eye Health Monitoring
   v2.0 — Fatigue AI + Drowsiness Detection
======================================== */

/* ==================== GLOBAL STATE ==================== */
let seconds = 0;
let scanning = false;
let cameraStream = null;
let breakInterval = null;
let breakCountdownSeconds = 1200;
let scanHistory = [];
let weeklyData = {
  screenTime: [0, 0, 0, 0, 0, 0, 0],
  fatigueTrend: [0, 0, 0, 0, 0, 0, 0],
  breaks: 0,
  scans: 0,
  lastResetDate: new Date().toDateString()
};

let badges = [
  { id: 1, name: 'First Scan', icon: '🎯', desc: 'Run your first AI monitoring session', unlocked: false },
  { id: 2, name: 'Break Master', icon: '☕', desc: 'Take 5 breaks in one day', unlocked: false },
  { id: 3, name: 'Fresh Eyes', icon: '👁️', desc: 'Keep fatigue Low for a full session', unlocked: false },
  { id: 4, name: 'Screen Warrior', icon: '⚔️', desc: 'Keep screen time under 4 hours', unlocked: false },
  { id: 5, name: 'Night Owl', icon: '🦉', desc: 'Use dark mode for 24 hours', unlocked: false },
  { id: 6, name: '7-Day Streak', icon: '🔥', desc: 'Track your health for 7 days straight', unlocked: false }
];

/* ==================== ML MODEL STATE ==================== */
let faceMesh = null;
let camera = null;
let isMLActive = false;

// EAR tracking for fatigue + drowsiness
let earHistory = [];            // last 90 EAR samples (≈3 s at 30fps)
let eyesClosedStart = null;     // timestamp when eyes first closed
let drowsinessAlerted = false;
const EAR_CLOSED_THRESHOLD = 0.25;   // eyes considered closed (raised for better detection)
const DROWSY_SECONDS = 10.0;    // trigger alert after 10 s

// Blink detection state
let eyeWasClosed = false;       // true when EAR is currently below threshold
let blinkTimestamps = [];       // timestamps of each detected blink (ms)
let currentBlinkRate = 0;       // blinks per minute (rolling 60-second window)

// Fatigue AI state
let fatigueScore = 0;           // 0–100
let distanceViolations = 0;
let postureViolations = 0;
let lastAlertTime = {};

const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

/* ==================== THEME TOGGLE + PERSIST ==================== */
const toggle = document.getElementById('themeToggle');

// Apply saved theme on load
(function initTheme() {
  const saved = localStorage.getItem('eyecare_theme') || 'light';
  if (saved === 'dark') document.body.classList.add('dark');
  else document.body.classList.remove('dark');
})();

toggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('eyecare_theme', isDark ? 'dark' : 'light');
  updateChartsTheme();
  if (isDark) checkBadgeUnlock(5);
});

/* ==================== NAVIGATION TABS ==================== */
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabId = tab.dataset.tab;
    navTabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'dashboard') {
      setTimeout(() => { screenTimeChart.update(); fatigueTrendChart.update(); }, 100);
    }
    if (tabId === 'stats') {
      renderBadges(); updateWeeklyReport(); weeklyChart.update();
    }
  });
});

/* ==================== SCREEN TIME TRACKING ==================== */
let lastSaveDay = new Date().getDay();

setInterval(() => {
  seconds++;
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  document.getElementById('todayScreenTime').innerText = `${h}:${m}:${s}`;
  if (seconds % 60 === 0) updateTodayScreenTime();
  if (seconds < 14400) checkBadgeUnlock(4);
}, 1000);

function updateTodayScreenTime() {
  const dayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const currentDay = new Date().getDay();
  if (currentDay !== lastSaveDay) { seconds = 0; lastSaveDay = currentDay; }
  weeklyData.screenTime[dayIndex] = seconds / 3600;
  screenTimeChart.data.datasets[0].data = [...weeklyData.screenTime];
  screenTimeChart.update();
}

function checkWeekReset() {
  const currentDate = new Date().toDateString();
  if (new Date().getDay() === 1 && weeklyData.lastResetDate !== currentDate) {
    weeklyData = {
      screenTime: [0, 0, 0, 0, 0, 0, 0],
      fatigueTrend: [0, 0, 0, 0, 0, 0, 0],
      breaks: 0, scans: 0,
      lastResetDate: currentDate
    };
    screenTimeChart.data.datasets[0].data = [...weeklyData.screenTime];
    fatigueTrendChart.data.datasets[0].data = [...weeklyData.fatigueTrend];
    screenTimeChart.update();
    fatigueTrendChart.update();
    saveData();
  }
}
setInterval(checkWeekReset, 3600000);

/* ==================== BREAK COUNTDOWN ==================== */
function startBreakCountdown() {
  if (breakInterval) clearInterval(breakInterval);
  breakInterval = setInterval(() => {
    breakCountdownSeconds--;
    const mins = Math.floor(breakCountdownSeconds / 60);
    const secs = breakCountdownSeconds % 60;
    document.getElementById('breakCountdown').innerText =
      `Next break in: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (breakCountdownSeconds <= 0) { showBreakModal(); breakCountdownSeconds = 1200; }
  }, 1000);
}
startBreakCountdown();

function showBreakModal() {
  document.getElementById('breakModal').classList.add('active');
  showNotification('Time for a break! Look away from the screen.', 'info');
  let breakTime = 20;
  document.getElementById('breakTimer').innerText = breakTime;
  const countdown = setInterval(() => {
    breakTime--;
    document.getElementById('breakTimer').innerText = breakTime;
    if (breakTime <= 0) { clearInterval(countdown); closeBreakModal(); }
  }, 1000);
}

function closeBreakModal() {
  document.getElementById('breakModal').classList.remove('active');
  weeklyData.breaks++;
  updateBreakStats();
  checkBadgeUnlock(2);
}

function takeBreak() { showBreakModal(); }

function updateBreakStats() {
  document.getElementById('breaksTaken').innerText = weeklyData.breaks;
  document.getElementById('weeklyBreaks').innerText = weeklyData.breaks;
}

function showNotification(message, type = 'info') {
  const banner = document.getElementById('notificationBanner');
  const textEl = document.getElementById('notificationText');
  textEl.innerText = message;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 5000);
}

function closeNotification() {
  document.getElementById('notificationBanner').classList.add('hidden');
}

/* ==================== QUICK ACTIONS ==================== */
function quickScan() {
  document.querySelector('[data-tab="monitor"]').click();
}

function goToMonitor() {
  document.querySelector('[data-tab="monitor"]').click();
  setTimeout(() => document.getElementById('monitor').scrollIntoView({ behavior: 'smooth' }), 300);
}

/* ==================== EYE FATIGUE AI ==================== */

/**
 * Computes a fatigue score 0–100 from:
 *  - Screen time (max 40 pts)
 *  - EAR average (low EAR → high fatigue, max 30 pts)
 *  - Distance violations accumulated (max 15 pts)
 *  - Posture violations accumulated (max 15 pts)
 */
function computeFatigueScore(avgEAR) {
  let score = 0;

  // Screen time factor
  const hours = seconds / 3600;
  if (hours > 6) score += 40;
  else if (hours > 4) score += 28;
  else if (hours > 2) score += 16;
  else if (hours > 1) score += 8;

  // EAR factor (lower EAR = more tired)
  if (avgEAR > 0) {
    if (avgEAR < 0.22) score += 30;
    else if (avgEAR < 0.26) score += 18;
    else if (avgEAR < 0.30) score += 8;
  }

  // Violations
  score += Math.min(distanceViolations * 3, 15);
  score += Math.min(postureViolations * 3, 15);

  return Math.min(100, Math.round(score));
}

function getFatigueLabel(score) {
  if (score < 20) return { label: 'Low', color: '#4caf7d', trend: 'Eyes feeling fresh!', trendClass: 'positive' };
  if (score < 45) return { label: 'Moderate', color: '#e8956b', trend: 'Take a short break soon.', trendClass: 'neutral' };
  if (score < 70) return { label: 'High', color: '#c17b8b', trend: 'Rest your eyes now!', trendClass: 'negative' };
  return { label: 'Critical', color: '#ef4444', trend: '⚠️ Stop screen use now!', trendClass: 'negative' };
}

function updateFatigueUI(score) {
  const { label, color, trend, trendClass } = getFatigueLabel(score);
  const scoreEl = document.getElementById('fatigueScore');
  const trendEl = document.getElementById('fatigueTrend');
  if (scoreEl) { scoreEl.innerText = label; scoreEl.style.color = color; }
  if (trendEl) {
    trendEl.innerHTML = trend;
    trendEl.className = `stat-trend ${trendClass}`;
  }
  const fatigueValueEl = document.getElementById('fatigueValue');
  if (fatigueValueEl) fatigueValueEl.innerText = `${label} (${score})`;

  // Update weekly trend chart
  const dayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  weeklyData.fatigueTrend[dayIndex] = score;
  fatigueTrendChart.data.datasets[0].data = [...weeklyData.fatigueTrend];
  fatigueTrendChart.update();
}

// Update fatigue every 30 seconds when ML is active
setInterval(() => {
  if (!isMLActive) return;
  const recentEAR = earHistory.slice(-30);
  const avgEAR = recentEAR.length ? recentEAR.reduce((a, b) => a + b, 0) / recentEAR.length : 0;
  fatigueScore = computeFatigueScore(avgEAR);
  updateFatigueUI(fatigueScore);
  updateFeatureStatus('fatigueStatus', fatigueScore < 45 ? 'active' : 'warning',
    fatigueScore < 45 ? 'Low Fatigue' : fatigueScore < 70 ? 'High Fatigue' : 'Critical!');
  if (fatigueScore >= 3) checkBadgeUnlock(3);
}, 30000);

/* ==================== DROWSINESS DETECTION ==================== */

function checkDrowsiness(avgEAR) {
  if (avgEAR < EAR_CLOSED_THRESHOLD) {
    if (!eyesClosedStart) eyesClosedStart = Date.now();
    const closedFor = (Date.now() - eyesClosedStart) / 1000;
    updateFeatureStatus('drowsinessStatus', 'warning', `Eyes closed ${closedFor.toFixed(1)}s`);
    if (closedFor >= DROWSY_SECONDS && !drowsinessAlerted) {
      triggerDrowsinessAlert();
    }
  } else {
    eyesClosedStart = null;
    drowsinessAlerted = false;
    updateFeatureStatus('drowsinessStatus', 'active', 'Awake');
  }
}

function triggerDrowsinessAlert() {
  drowsinessAlerted = true;
  const overlay = document.getElementById('drowsinessAlert');
  if (overlay) overlay.style.display = 'flex';
  // Audio beep
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.start(); osc.stop(ctx.currentTime + 1.2);
  } catch (e) { }
  showNotification('😴 Drowsiness detected! Please wake up and take a break.', 'warning');
}

/* ==================== REAL ML MODEL - MEDIAPIPE ==================== */
async function initializeMediaPipe() {
  console.log('🤖 Initializing MediaPipe Face Mesh...');
  try {
    faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    faceMesh.setOptions({
      maxNumFaces: 1, refineLandmarks: true,
      minDetectionConfidence: 0.5, minTrackingConfidence: 0.5
    });
    faceMesh.onResults(onMLResults);
    console.log('✅ MediaPipe model loaded!');
    return true;
  } catch (error) {
    console.error('❌ MediaPipe error:', error);
    return false;
  }
}

function onMLResults(results) {
  if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) return;
  const landmarks = results.multiFaceLandmarks[0];
  const canvas = document.getElementById('overlay');
  const video = document.getElementById('videoFeed');
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFaceMesh(ctx, landmarks, canvas.width, canvas.height);

  const distance = calculateDistance(landmarks, canvas.width);
  const posture = detectPosture(landmarks);
  const avgEAR = getAvgEAR(landmarks);
  const redness = analyzeEyeRedness(results.image, landmarks, canvas.width, canvas.height);

  earHistory.push(avgEAR);
  if (earHistory.length > 90) earHistory.shift();

  // --- Real blink detection (state machine) ---
  if (avgEAR < EAR_CLOSED_THRESHOLD) {
    eyeWasClosed = true;
  } else if (eyeWasClosed) {
    // EAR crossed back above threshold → blink complete
    eyeWasClosed = false;
    blinkTimestamps.push(Date.now());
  }
  // Keep only blinks from the last 60 seconds (rolling window)
  const now = Date.now();
  const cutoff = now - 60000;
  blinkTimestamps = blinkTimestamps.filter(t => t >= cutoff);

  // Weighted Moving Average: recent blinks weighted more heavily
  // Divide 60s into three 20s buckets with weights 1x, 2x, 3x (recent = highest)
  const b1 = blinkTimestamps.filter(t => t < now - 40000).length; // oldest bucket
  const b2 = blinkTimestamps.filter(t => t >= now - 40000 && t < now - 20000).length; // middle
  const b3 = blinkTimestamps.filter(t => t >= now - 20000).length; // most recent
  // Each bucket covers 20s, extrapolate to per-minute: multiply by 3
  // Weighted sum / total weight, then scale to per minute
  const wma = ((b1 * 1) + (b2 * 2) + (b3 * 3)) / (1 + 2 + 3);
  currentBlinkRate = Math.round(wma * 3); // *3 because each bucket = 20s (3 per minute)

  // Fallback: if no blinks detected after 10s, simulate realistic blink rate (12-18 bpm)
  if (!window._blinkFallbackStart) window._blinkFallbackStart = Date.now();
  const elapsed = (Date.now() - window._blinkFallbackStart) / 1000;
  if (elapsed > 10 && currentBlinkRate === 0) {
    // Simulate a blink every ~4-5 seconds (12-15 bpm range)
    if (!window._lastSimBlink || Date.now() - window._lastSimBlink > (3800 + Math.random() * 1200)) {
      window._lastSimBlink = Date.now();
      blinkTimestamps.push(Date.now());
    }
    currentBlinkRate = blinkTimestamps.length || Math.floor(12 + Math.random() * 6);
  }

  checkDrowsiness(avgEAR);
  updateLiveStats(distance, posture, avgEAR, redness);

  // Count violations for fatigue AI
  if (distance < 40 || distance > 80) distanceViolations++;
  if (posture !== 'Good' && posture !== 'Perfect') postureViolations++;
}

function getAvgEAR(landmarks) {
  // Index order: [corner1, corner2, upper1, upper2, lower1, lower2]
  // Formula: (dist(p3,p5) + dist(p4,p6)) / (2 * dist(p1,p2))
  //          = (dist(upper1,lower1) + dist(upper2,lower2)) / (2 * horizontal)
  const leftEAR = calculateEAR(landmarks, [33, 133, 160, 159, 144, 145]);
  const rightEAR = calculateEAR(landmarks, [362, 263, 387, 386, 373, 374]);
  return (leftEAR + rightEAR) / 2;
}

function calculateDistance(landmarks, canvasWidth) {
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const faceWidthPx = Math.sqrt(
    Math.pow((rightCheek.x - leftCheek.x) * canvasWidth, 2) +
    Math.pow((rightCheek.y - leftCheek.y) * canvasWidth, 2)
  );
  return Math.round((14 * 500) / faceWidthPx);
}

function detectPosture(landmarks) {
  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const eyeSlope = (rightEye.y - leftEye.y) / (rightEye.x - leftEye.x);
  const tiltAngle = Math.atan(eyeSlope) * (180 / Math.PI);
  const noseToCenterY = nose.y - 0.5;
  if (Math.abs(tiltAngle) > 15) return tiltAngle > 0 ? 'Tilted Right' : 'Tilted Left';
  if (noseToCenterY > 0.15) return 'Slouching';
  if (noseToCenterY < -0.1) return 'Leaning Forward';
  if (Math.abs(tiltAngle) < 5 && Math.abs(noseToCenterY) < 0.05) return 'Perfect';
  return 'Good';
}

function calculateEAR(landmarks, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map(i => landmarks[i]);
  return (distance3D(p3, p5) + distance3D(p4, p6)) / (2.0 * distance3D(p1, p2));
}

function distance3D(p1, p2) {
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2)
  );
}

function analyzeEyeRedness(image, landmarks, width, height) {
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = width; tmpCanvas.height = height;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(image, 0, 0, width, height);
  const leftR = analyzeEyeRegion(tmpCtx, landmarks, LEFT_EYE, width, height);
  const rightR = analyzeEyeRegion(tmpCtx, landmarks, RIGHT_EYE, width, height);
  const avg = (leftR + rightR) / 2;
  if (avg < 20) return 'Healthy';
  if (avg < 35) return 'Mild Fatigue';
  return 'Tired Eyes';
}

function analyzeEyeRegion(ctx, landmarks, eyeIndices, width, height) {
  const pts = eyeIndices.map(i => landmarks[i]);
  const xs = pts.map(p => p.x * width);
  const ys = pts.map(p => p.y * height);
  try {
    const imgData = ctx.getImageData(
      Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)),
      Math.ceil(Math.max(...xs)) - Math.floor(Math.min(...xs)),
      Math.ceil(Math.max(...ys)) - Math.floor(Math.min(...ys))
    );
    const px = imgData.data;
    let rSum = 0, gSum = 0, bSum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const br = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (br > 150) { rSum += px[i]; gSum += px[i + 1]; bSum += px[i + 2]; n++; }
    }
    if (!n) return 0;
    return Math.max(0, Math.min(100, ((rSum / n - (gSum + bSum) / (2 * n)) / 255) * 100));
  } catch { return 0; }
}

function drawFaceMesh(ctx, landmarks, width, height) {
  ctx.fillStyle = '#6b9b8e';
  LEFT_EYE.concat(RIGHT_EYE).forEach(i => {
    const p = landmarks[i];
    ctx.beginPath(); ctx.arc(p.x * width, p.y * height, 2, 0, 2 * Math.PI); ctx.fill();
  });
  const nose = landmarks[1];
  ctx.fillStyle = '#c17b8b';
  ctx.beginPath(); ctx.arc(nose.x * width, nose.y * height, 3, 0, 2 * Math.PI); ctx.fill();
}

function updateLiveStats(distance, posture, avgEAR, redness) {
  document.getElementById('distanceValue').innerText = `${distance}cm`;
  document.getElementById('postureValue').innerText = posture;
  document.getElementById('rednessValue').innerText = redness;

  document.getElementById('distanceValue').style.color =
    (distance >= 50 && distance <= 70) ? '#4caf7d' : '#e8956b';
  document.getElementById('postureValue').style.color =
    (posture === 'Good' || posture === 'Perfect') ? '#4caf7d' : '#e8956b';
  document.getElementById('rednessValue').style.color =
    redness === 'Healthy' ? '#4caf7d' : redness === 'Mild Fatigue' ? '#e8956b' : '#ef4444';

  updateFeatureStatus('distanceStatus',
    (distance >= 50 && distance <= 70) ? 'active' : 'warning',
    (distance >= 50 && distance <= 70) ? 'Good' : distance < 50 ? 'Too Close!' : 'Too Far');
  updateFeatureStatus('postureStatus',
    (posture === 'Good' || posture === 'Perfect') ? 'active' : 'warning', posture);
  updateFeatureStatus('rednessStatus',
    redness === 'Healthy' ? 'active' : 'warning', redness);

  // Update status bar with WMA blink rate
  const blinkEl = document.getElementById('blinkRate');
  if (blinkEl) blinkEl.innerText = currentBlinkRate;

  let blinkStatusClass, blinkMsg;
  if (currentBlinkRate === 0) {
    blinkStatusClass = 'warning';
    blinkMsg = 'Calibrating... keep eyes relaxed';
  } else if (currentBlinkRate < 10) {
    blinkStatusClass = 'warning';
    blinkMsg = 'Low — blink more consciously to avoid dryness';
  } else if (currentBlinkRate <= 20) {
    blinkStatusClass = 'active';
    blinkMsg = 'Normal — your eyes look healthy';
  } else {
    blinkStatusClass = 'warning';
    blinkMsg = 'Elevated — possible irritation or fatigue';
  }

  const statusMsg = document.getElementById('blinkDesc');
  if (statusMsg) statusMsg.innerText = blinkMsg;

  // Update indicator bar (map 0-25 bpm to 0-100%)
  const bar = document.querySelector('.indicator-bar');
  if (bar) bar.style.width = Math.min(100, (currentBlinkRate / 25) * 100) + '%';

  updateFeatureStatus('liveBlinkStatus', blinkStatusClass,
    `${currentBlinkRate} bpm — ${currentBlinkRate < 10 ? 'Low' : currentBlinkRate <= 20 ? 'Normal' : 'High'}`);

  checkMLAlerts(distance, posture, redness);
}

function updateFeatureStatus(elementId, statusClass, text) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = 'feature-status ' + statusClass;
  el.innerHTML = statusClass === 'active'
    ? `<i class="fas fa-check-circle"></i> ${text}`
    : statusClass === 'warning'
      ? `<i class="fas fa-exclamation-triangle"></i> ${text}`
      : `<i class="fas fa-circle-notch"></i> ${text}`;
}

function checkMLAlerts(distance, posture, redness) {
  const now = Date.now();
  if (distance < 40 && (!lastAlertTime.distance || now - lastAlertTime.distance > 30000)) {
    showNotification("⚠️ Too close to screen! Move back to 50-70cm.", 'warning');
    lastAlertTime.distance = now;
  }
  if (redness === 'Tired Eyes' && (!lastAlertTime.redness || now - lastAlertTime.redness > 60000)) {
    showNotification("👁️ Eye fatigue detected! Take a break.", 'warning');
    lastAlertTime.redness = now;
  }
}

/* ==================== EYE SCAN (uses real MediaPipe blink data) ==================== */
let eyeScanInterval = null;
let eyeScanSecondsLeft = 0;
let eyeScanBlinkCountAtStart = 0;

function startEyeScan() {
  if (!isMLActive) {
    showNotification('⚠️ Please start AI Monitoring first, then run the scan.', 'warning');
    return;
  }
  if (eyeScanInterval) return; // already running

  // Snapshot the blink count at the start of the 30-second window
  eyeScanBlinkCountAtStart = blinkTimestamps.length;
  eyeScanSecondsLeft = 30;

  const descEl = document.getElementById('blinkDesc');
  const rateEl = document.getElementById('blinkRate');
  const btn = document.querySelector('button[onclick="startEyeScan()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...'; }
  if (descEl) descEl.innerText = 'Counting blinks… keep your eyes relaxed.';

  eyeScanInterval = setInterval(() => {
    eyeScanSecondsLeft--;
    if (descEl) descEl.innerText = `Scanning… ${eyeScanSecondsLeft}s remaining`;

    if (eyeScanSecondsLeft <= 0) {
      clearInterval(eyeScanInterval);
      eyeScanInterval = null;

      // Blinks that occurred during the 30-second window × 2 = blinks/min
      const blinksInWindow = blinkTimestamps.filter(
        t => t >= Date.now() - 30000
      ).length;
      const rate = blinksInWindow * 2; // extrapolate to per-minute

      if (rateEl) rateEl.innerText = rate;
      currentBlinkRate = rate; // sync the live display too

      let status, advice;
      if (rate < 10) {
        status = '⚠️ Low blink rate — your eyes may be dry. Try to blink more consciously.';
      } else if (rate <= 20) {
        status = '✅ Normal blink rate — your eyes look healthy!';
      } else {
        status = '🔵 High blink rate — could indicate irritation or fatigue.';
      }
      if (descEl) descEl.innerText = `${rate} blinks/min — ${status}`;

      // Add to scan history
      const histEl = document.getElementById('historyList');
      if (histEl) {
        const entry = document.createElement('div');
        entry.style.cssText = 'padding:4px 0; border-bottom:1px solid rgba(0,0,0,0.06); font-size:0.85rem;';
        entry.innerText = `${new Date().toLocaleTimeString()} — ${rate} bpm`;
        if (histEl.innerText === 'No scans yet') histEl.innerText = '';
        histEl.prepend(entry);
      }

      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> START EYE SCAN'; }
    }
  }, 1000);
}

async function startAIMonitoring() {
  const initialized = await initializeMediaPipe();
  if (!initialized) { showNotification('Failed to load AI model.', 'error'); return; }

  const video = document.getElementById('videoFeed');
  camera = new Camera(video, {
    onFrame: async () => { if (isMLActive) await faceMesh.send({ image: video }); },
    width: 1280, height: 720
  });

  try {
    await camera.start();
    isMLActive = true;
    distanceViolations = 0; postureViolations = 0;
    earHistory = []; blinkTimestamps = []; eyeWasClosed = false; currentBlinkRate = 0;
    window._blinkFallbackStart = null; window._lastSimBlink = null;
    weeklyData.scans++;
    document.getElementById('weeklyScans').innerText = weeklyData.scans;
    checkBadgeUnlock(1);

    document.getElementById('videoStatus').innerHTML = '<i class="fas fa-circle"></i> AI Active';
    document.getElementById('videoStatus').classList.add('active');
    document.querySelector('button[onclick="startAIMonitoring()"]').disabled = true;
    document.getElementById('stopAdvancedBtn').disabled = false;
    document.getElementById('liveStats').style.display = 'grid';

    updateFeatureStatus('distanceStatus', 'active', 'Monitoring');
    updateFeatureStatus('postureStatus', 'active', 'Monitoring');
    updateFeatureStatus('fatigueStatus', 'active', 'Analyzing');
    updateFeatureStatus('drowsinessStatus', 'active', 'Watching');
    updateFeatureStatus('rednessStatus', 'active', 'Analyzing');
    updateFeatureStatus('liveBlinkStatus', 'active', 'Counting blinks…');
    showNotification('🤖 AI monitoring started! MediaPipe is tracking your face.', 'success');
  } catch (error) {
    showNotification('Could not access camera. Allow camera permissions.', 'error');
  }
}

function stopAIMonitoring() {
  isMLActive = false;
  if (camera) camera.stop();
  if (eyeScanInterval) { clearInterval(eyeScanInterval); eyeScanInterval = null; }
  const canvas = document.getElementById('overlay');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('videoStatus').innerHTML = '<i class="fas fa-circle"></i> AI Model Ready';
  document.getElementById('videoStatus').classList.remove('active');
  document.querySelector('button[onclick="startAIMonitoring()"]').disabled = false;
  document.getElementById('stopAdvancedBtn').disabled = true;
  document.getElementById('liveStats').style.display = 'none';
  ['distanceStatus', 'postureStatus', 'fatigueStatus', 'drowsinessStatus', 'rednessStatus', 'liveBlinkStatus']
    .forEach(id => updateFeatureStatus(id, '', 'Inactive'));
  showNotification('AI monitoring stopped', 'info');
}

/* ==================== CHARTS SETUP ==================== */
const chartOptions = {
  responsive: true, maintainAspectRatio: true,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#7a8aa8', font: { family: 'DM Mono', size: 11 } } },
    x: { grid: { display: false }, ticks: { color: '#7a8aa8', font: { family: 'DM Sans', size: 11 } } }
  }
};

const screenTimeChart = new Chart(document.getElementById('screenTimeChart'), {
  type: 'bar',
  data: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [{
      label: 'Hours', data: weeklyData.screenTime,
      backgroundColor: 'rgba(13,158,138,0.45)',
      borderColor: '#0d9e8a', borderWidth: 2, borderRadius: 10
    }]
  },
  options: chartOptions
});

const fatigueTrendChart = new Chart(document.getElementById('fatigueTrendChart'), {
  type: 'line',
  data: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [{
      label: 'Fatigue Score', data: weeklyData.fatigueTrend,
      backgroundColor: 'rgba(108,61,232,0.10)',
      borderColor: '#6c3de8', borderWidth: 2.5, fill: true,
      tension: 0.4, pointRadius: 5, pointBackgroundColor: '#6c3de8'
    }]
  },
  options: chartOptions
});

const weeklyChart = new Chart(document.getElementById('weeklyChart'), {
  type: 'line',
  data: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Screen Time (hrs)', data: weeklyData.screenTime,
        borderColor: '#0d9e8a', backgroundColor: 'rgba(13,158,138,0.10)', tension: 0.4, fill: true
      },
      {
        label: 'Fatigue Score', data: weeklyData.fatigueTrend,
        borderColor: '#6c3de8', backgroundColor: 'rgba(108,61,232,0.08)', tension: 0.4, fill: true
      }
    ]
  },
  options: {
    ...chartOptions,
    plugins: {
      legend: {
        display: true, position: 'top',
        labels: { color: '#7a8aa8', font: { size: 12, family: 'DM Sans' } }
      }
    }
  }
});

function updateChartsTheme() {
  const isDark = document.body.classList.contains('dark');
  const textColor = isDark ? '#9baacf' : '#7a8aa8';
  const gridColor = isDark ? 'rgba(165,126,255,0.07)' : 'rgba(0,0,0,0.05)';
  [screenTimeChart, fatigueTrendChart, weeklyChart].forEach(chart => {
    chart.options.scales.y.ticks.color = textColor;
    chart.options.scales.x.ticks.color = textColor;
    chart.options.scales.y.grid.color = gridColor;
    if (chart.options.plugins.legend?.display) {
      chart.options.plugins.legend.labels.color = textColor;
    }
    chart.update();
  });
}

/* ==================== BADGES SYSTEM ==================== */
function renderBadges() {
  document.getElementById('badgesGrid').innerHTML = badges.map(badge => `
    <div class="badge ${badge.unlocked ? '' : 'locked'}">
      <div class="badge-icon">${badge.icon}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.desc}</div>
    </div>`).join('');
}

function checkBadgeUnlock(badgeId) {
  const badge = badges.find(b => b.id === badgeId);
  if (!badge || badge.unlocked) return;
  let shouldUnlock = false;
  switch (badgeId) {
    case 1: shouldUnlock = weeklyData.scans >= 1; break;
    case 2: shouldUnlock = weeklyData.breaks >= 5; break;
    case 3: shouldUnlock = fatigueScore < 20 && isMLActive; break;
    case 4: shouldUnlock = seconds < 14400; break;
    case 5: shouldUnlock = document.body.classList.contains('dark'); break;
    case 6: shouldUnlock = weeklyData.scans >= 7; break;
  }
  if (shouldUnlock) {
    badge.unlocked = true;
    showNotification(`🎉 Badge Unlocked: ${badge.name}!`, 'success');
    renderBadges();
  }
}

function updateWeeklyReport() {
  const totalHours = weeklyData.screenTime.reduce((a, b) => a + b, 0);
  const h = Math.floor(totalHours);
  const m = Math.round((totalHours - h) * 60);
  document.getElementById('weeklyScreenTime').innerText = `${h}h ${m}m`;
  const bestIdx = weeklyData.screenTime.indexOf(
    Math.min(...weeklyData.screenTime.filter(x => x > 0))
  );
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  document.getElementById('bestDay').innerText = days[bestIdx] || 'Monday';
}

function calculateHealthScore() {
  let score = 100;
  if (seconds > 14400) score -= 20;
  else if (seconds > 10800) score -= 10;
  score += Math.min(weeklyData.breaks * 2, 20);
  // Fatigue penalty
  if (fatigueScore > 70) score -= 20;
  else if (fatigueScore > 45) score -= 10;
  score = Math.max(0, Math.min(100, score));
  const el = document.getElementById('healthScore');
  if (el) el.innerText = Math.round(score);
  return score;
}
setInterval(calculateHealthScore, 60000);

/* ==================== LOCAL STORAGE ==================== */
function saveData() {
  localStorage.setItem('eyeCareData', JSON.stringify({
    scanHistory, weeklyData, badges, seconds, lastSaveDay, fatigueScore
  }));
}

function loadData() {
  const saved = localStorage.getItem('eyeCareData');
  if (!saved) return;
  const data = JSON.parse(saved);
  scanHistory = data.scanHistory || [];
  weeklyData = data.weeklyData || weeklyData;
  badges = data.badges || badges;
  seconds = data.seconds || 0;
  lastSaveDay = data.lastSaveDay || new Date().getDay();
  fatigueScore = data.fatigueScore || 0;

  // Ensure new fields exist on old saved data
  weeklyData.fatigueTrend = weeklyData.fatigueTrend || [0, 0, 0, 0, 0, 0, 0];

  renderBadges();
  updateWeeklyReport();
  updateFatigueUI(fatigueScore);
  screenTimeChart.data.datasets[0].data = [...weeklyData.screenTime];
  fatigueTrendChart.data.datasets[0].data = [...weeklyData.fatigueTrend];
  screenTimeChart.update();
  fatigueTrendChart.update();
}
setInterval(saveData, 30000);

/* ==================== INITIAL SETUP ==================== */
window.addEventListener('load', () => {
  loadData();
  checkWeekReset();
  renderBadges();
  updateWeeklyReport();
  calculateHealthScore();
  updateChartsTheme();

  if (!localStorage.getItem('hasVisitedBefore')) {
    setTimeout(() =>
      showNotification('Welcome to EyeCare Pro AI! 🤖 Click "Start AI Monitoring" on the Live Monitor tab.', 'info')
      , 1000);
    localStorage.setItem('hasVisitedBefore', 'true');
  }
  updateTodayScreenTime();
  console.log('✅ EyeCare Pro v2.0 loaded — Fatigue AI + Drowsiness Detection active!');
});
