// routes/auth.js
// Defineix els endpoints públics d'autenticació (no requereixen JWT).

const express    = require('express');
const router     = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/login  →  Inici de sessió
router.post('/login', authController.login);

module.exports = router;