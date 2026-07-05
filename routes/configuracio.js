'use strict';

const express = require('express');
const router  = express.Router();
const { verificarToken } = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/configuracioCursController');

// GET  /api/configuracio           → llista tots els cursos
// POST /api/configuracio           → crea nou curs
// POST /api/configuracio/:id/activar → activa un curs
// DELETE /api/configuracio/:id    → elimina un curs (no actiu)

router.get('/',                  verificarToken, ctrl.llistar);
router.post('/',                 verificarToken, ctrl.crear);
router.post('/:id/activar',      verificarToken, ctrl.activar);
router.put('/:id/dates',         verificarToken, ctrl.actualitzarDates);
router.delete('/:id',            verificarToken, ctrl.eliminar);

module.exports = router;
