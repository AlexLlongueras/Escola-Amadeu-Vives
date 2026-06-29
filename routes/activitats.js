// routes/activitats.js
const express    = require('express');
const router     = express.Router();
const { verificarToken, autoritzarRol } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/activitatsController');

// GET /api/activitats — tots els rols autenticats
router.get('/',
  verificarToken,
  autoritzarRol(['admin', 'profesor', 'alumne', 'familia']),
  ctrl.llistar
);

// GET /api/activitats/calendari — activitats inscrites de l'alumne
router.get('/calendari',
  verificarToken,
  autoritzarRol(['alumne', 'familia']),
  ctrl.calendariAlumne
);

// POST /api/activitats/:id/inscriure — només alumne/família
router.post('/:id/inscriure',
  verificarToken,
  autoritzarRol(['alumne', 'familia']),
  ctrl.inscriure
);

// DELETE /api/activitats/:id/desinscriure — només alumne/família
router.delete('/:id/desinscriure',
  verificarToken,
  autoritzarRol(['alumne', 'familia']),
  ctrl.desinscriure
);

module.exports = router;