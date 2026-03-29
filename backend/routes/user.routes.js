const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { getProfile, updateProfile, updateHealthScore } = require('../controllers/user.controller');

router.get('/',              auth, getProfile);
router.put('/',              auth, updateProfile);
router.put('/health-score',  auth, updateHealthScore);

module.exports = router;
