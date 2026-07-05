'use strict';

const jwt     = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

/**
 * Middleware únic: verificarToken
 * Comprova que el JWT és vàlid I que pertany a un usuari amb rol 'admin'.
 * Retorna 401 si el token és invàlid/expirat, 403 si el rol no és admin.
 */
const verificarToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionat.' });
    }

    const token   = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const usuari = await Usuario.findById(payload.id);
    if (!usuari) {
      return res.status(401).json({ error: 'Usuari no trobat.' });
    }
    if (usuari.rol !== 'admin') {
      return res.status(403).json({ error: 'Accés restringit a administradors.' });
    }

    req.usuari = { id: usuari.id_usuari, rol: 'admin', nom: usuari.nom_usuari };
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessió expirada. Torna a fer login.' });
    }
    return res.status(401).json({ error: 'Token invàlid.' });
  }
};

// Mantenim autoritzarRol com a no-op per compatibilitat amb qualsevol ruta que el cridi
const autoritzarRol = (_rols) => (_req, _res, next) => next();

module.exports = { verificarToken, autoritzarRol };
