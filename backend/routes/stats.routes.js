const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
  logScreenTime,
  getDashboard,
  getWeekly,
  getBadges,
  saveBadge,
  saveAlert
} = require('../controllers/stats.controller');

router.post('/screentime', auth, logScreenTime);
router.get('/dashboard',   auth, getDashboard);
router.get('/weekly',      auth, getWeekly);
router.get('/badges',      auth, getBadges);
router.post('/badges',     auth, saveBadge);
router.post('/alerts',     auth, saveAlert);

module.exports = router;
