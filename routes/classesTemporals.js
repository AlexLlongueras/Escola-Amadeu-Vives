'use strict';

const express = require('express');
const router  = express.Router();
const { verificarToken } = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/classesTemporalsController');

// GET  /api/classes-temporals?grup=1r A[&any_escolar=]   → per grup
// GET  /api/classes-temporals/all?any_escolar=            → tots els del curs
// POST /api/classes-temporals                             → crear
// DELETE /api/classes-temporals/:id                      → eliminar

router.get('/',         verificarToken, ctrl.getByGrup);
router.get('/all',      verificarToken, ctrl.getAll);
router.post('/',        verificarToken, ctrl.crear);
router.delete('/:id',   verificarToken, ctrl.eliminar);

module.exports = router;
