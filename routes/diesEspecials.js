// routes/diesEspecials.js
// Rutes per al mòdul de Dies Especials (festius, excursions, colònies).
//
// GET  /api/dies-especials              → tots els rols autenticats
// POST /api/dies-especials              → exclusiu admin
// DELETE /api/dies-especials/:id        → exclusiu admin

'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/diesEspecialsController');
const { verificarToken, autoritzarRol } = require('../middleware/authMiddleware');

// Lectura: qualsevol usuari autenticat pot consultar dies especials
router.get('/',    verificarToken, ctrl.llistar);

// Creació: exclusiu per a admin
router.post('/',   verificarToken, autoritzarRol(['admin']), ctrl.crear);

// Eliminació: exclusiu per a admin
router.delete('/:id', verificarToken, autoritzarRol(['admin']), ctrl.eliminar);

module.exports = router;
