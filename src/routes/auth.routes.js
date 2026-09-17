const { Router } = require('express');
const authController = require('../controllers/auth.controller');

const router = Router();

router.post('/auth/login', authController.postLogin);

module.exports = router;
