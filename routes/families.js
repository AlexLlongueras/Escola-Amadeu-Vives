// routes/families.js
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, autoritzarRol }        = require('../middleware/authMiddleware');
const { obtenirAnyEscolar, validarAnyEscolar } = require('../utils/anyEscolar');

/**
 * GET /api/families/fills[?any_escolar=2025/2026]
 *
 * Retorna els fills (alumnes) vinculats a l'usuari família loguejat,
 * FILTRATS per l'any escolar indicat.
 *
 * Per què filtre per any_escolar?
 *   La taula ALUMNE té UNIQUE(id_usuari, any_escolar): un alumne pot
 *   aparèixer com a "Joan – 1r A" el 2024/2025 i "Joan – 2n A" el 2025/2026.
 *   Sense filtre, el desplegable mostraria les dues files, trencant la lògica.
 */
router.get('/fills',
  verificarToken,
  autoritzarRol(['familia']),
  async (req, res) => {

    // ── Determinar l'any escolar ──────────────────────────────────────────────
    let any_escolar = obtenirAnyEscolar();
    if (req.query.any_escolar) {
      if (!validarAnyEscolar(req.query.any_escolar)) {
        return res.status(400).json({
          error: 'Format d\'any_escolar incorrecte. Usa el format AAAA/AAAA (ex: 2025/2026).',
        });
      }
      any_escolar = req.query.any_escolar;
    }

    // ── Consulta filtrada per any escolar ─────────────────────────────────────
    const [fills] = await pool.execute(`
      SELECT
        al.id_alumne,
        al.grup,
        al.curs,
        al.any_escolar,
        u.nom_usuari  AS nom_alumne,
        fa.parentesc
      FROM   FAMILIA_ALUMNE fa
      JOIN   ALUMNE         al ON fa.id_alumne = al.id_alumne
      JOIN   USUARI         u  ON al.id_usuari  = u.id_usuari
      WHERE  fa.id_familia  = ?
        AND  al.any_escolar = ?
      ORDER BY u.nom_usuari
    `, [req.usuari.id, any_escolar]);

    if (fills.length === 0) {
      return res.status(404).json({
        error: `No tens cap alumne matriculat per al curs ${any_escolar}. Contacta amb l'administrador.`,
      });
    }

    return res.status(200).json({ fills, any_escolar });
  }
);

module.exports = router;