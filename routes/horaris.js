// routes/horaris.js
// Rutes de HORARI_LECTIU amb protecció per token i rol.

const express    = require('express');
const router     = express.Router();
const { verificarToken, autoritzarRol } = require('../middleware/authMiddleware');
const horarisController = require('../controllers/horarisController');

// GET /api/horaris?grup=1r A
// Qualsevol usuari logueat pot consultar horaris
router.get(
  '/',
  verificarToken,
  autoritzarRol(['admin', 'profesor', 'alumne', 'familia']),
  horarisController.getByGrup
);

// POST /api/horaris
// Només l'admin pot crear franges horàries
router.post(
  '/',
  verificarToken,
  autoritzarRol(['admin']),
  horarisController.create
);

module.exports = router;