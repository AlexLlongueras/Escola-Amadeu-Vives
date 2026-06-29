// middleware/authMiddleware.js
// Dos middlewares reutilitzables per protegir rutes:
//   1. verificarToken  → comprova que el JWT és vàlid
//   2. autoritzarRol   → comprova que el rol de l'usuari té accés

const jwt     = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

/**
 * Middleware 1: verificarToken
 * ─────────────────────────────
 * Llegeix el JWT de la capçalera Authorization: Bearer <token>
 * Si és vàlid, afegeix req.usuari = { id, rol } i crida next().
 * Si no, retorna 401.
 *
 * Usat a TOTES les rutes protegides.
 */
const verificarToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    // Format esperat: "Bearer eyJhbGci..."
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Accés denegat. Token no proporcionat.' });
    }

    const token = authHeader.split(' ')[1];

    // jwt.verify llença una excepció si el token és invàlid o ha expirat
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Verifiquem que l'usuari encara existeix a la BD (pot haver estat eliminat)
    const usuari = await Usuario.findById(payload.id);
    if (!usuari) {
      return res.status(401).json({ error: 'Usuari no trobat. Token invàlid.' });
    }

    // Afegim les dades de l'usuari a la request per als controllers
    req.usuari = { id: usuari.id_usuari, rol: usuari.rol, nom: usuari.nom_usuari };
    next();

  } catch (err) {
    // Diferenciem tokens expirats d'altres errors de verificació
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'La sessió ha expirat. Torna a fer login.' });
    }
    return res.status(401).json({ error: 'Token invàlid.' });
  }
};

/**
 * Middleware 2: autoritzarRol
 * ─────────────────────────────
 * Factory function: rep un array de rols permesos i retorna un middleware.
 * S'usa SEMPRE després de verificarToken (depèn de req.usuari).
 *
 * Exemples d'ús a les rutes:
 *   router.get('/horaris', verificarToken, autoritzarRol(['admin', 'profesor']), controller)
 *   router.post('/usuaris', verificarToken, autoritzarRol(['admin']), controller)
 *   router.get('/activitats', verificarToken, autoritzarRol(['alumne', 'familia']), controller)
 */
const autoritzarRol = (rolsPermesos) => {
  return (req, res, next) => {
    if (!req.usuari) {
      // Protecció: no s'hauria de poder cridar sense verificarToken abans
      return res.status(500).json({ error: 'Error de configuració de middleware.' });
    }

    if (!rolsPermesos.includes(req.usuari.rol)) {
      return res.status(403).json({
        error: `Accés denegat. Rol '${req.usuari.rol}' no autoritzat per a aquest recurs.`,
      });
    }

    next();
  };
};

module.exports = { verificarToken, autoritzarRol };