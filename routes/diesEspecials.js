'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/diesEspecialsController');
const { verificarToken } = require('../middleware/authMiddleware');

router.get('/',       verificarToken, ctrl.llistar);
router.post('/',      verificarToken, ctrl.crear);
router.delete('/:id', verificarToken, ctrl.eliminar);

module.exports = router;
