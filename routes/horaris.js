'use strict';

const express = require('express');
const router  = express.Router();
const { verificarToken } = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/horarisController');

// GET  /api/horaris/professor/:id[?any_escolar=…]
router.get('/professor/:id',                           verificarToken, ctrl.getByProfessor);

// GET  /api/horaris?grup=1r A[&any_escolar=…]
router.get('/',                                        verificarToken, ctrl.getByGrup);

// POST /api/horaris
router.post('/',                                       verificarToken, ctrl.create);

// PUT  /api/horaris/:id
router.put('/:id',                                     verificarToken, ctrl.actualitzar);

// POST   /api/horaris/:id/professors
router.post('/:id/professors',                         verificarToken, ctrl.afegirProfessor);

// DELETE /api/horaris/:id/professors/:id_prof
router.delete('/:id/professors/:id_prof',              verificarToken, ctrl.eliminarProfessor);

// PUT    /api/horaris/:id/professors/:id_prof/substitut
router.put('/:id/professors/:id_prof/substitut',       verificarToken, ctrl.actualitzarSubstitut);

module.exports = router;
