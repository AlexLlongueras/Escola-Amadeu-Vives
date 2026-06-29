// routes/admin.js
// Endpoints exclusius per al rol 'admin'.
//
// CANVI v2: les consultes d'horaris i activitats filtren per any_escolar.
// L'admin pot passar ?any_escolar=2025/2026 per consultar anys anteriors.
// Si no ho fa, s'usa l'any escolar actual calculat automàticament.

'use strict';

const express  = require('express');
const router   = express.Router();
const pool     = require('../config/db');
const { verificarToken, autoritzarRol }          = require('../middleware/authMiddleware');
const { obtenirAnyEscolar, validarAnyEscolar }   = require('../utils/anyEscolar');

const soloAdmin = [verificarToken, autoritzarRol(['admin'])];

// ─── Helper local per extreure l'any escolar de la request ────────────────────
// Accepta el paràmetre ?any_escolar=AAAA/AAAA o el camp del body.
// Si no ve o és invàlid, usa l'any actual.
function resoldrAnyEscolar(req) {
  const candidat = req.query.any_escolar || req.body?.any_escolar;
  if (candidat && validarAnyEscolar(candidat)) return candidat;
  return obtenirAnyEscolar();
}

// ─────────────────────────────────────────────────────────────────────────────
// CATÀLEGS (sense filtre d'any — entitats permanents)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/grups[?any_escolar=2025/2026]
// Retorna la llista de grups registrats per a un curs escolar concret.
router.get('/grups', ...soloAdmin, async (req, res) => {
  const any_escolar = resoldrAnyEscolar(req);
  const [rows] = await pool.execute(
    'SELECT nom FROM GRUPS_CLASSE WHERE any_escolar = ? ORDER BY nom',
    [any_escolar]
  );
  res.json({ any_escolar, grups: rows.map(r => r.nom) });
});

// GET /api/admin/aules
router.get('/aules', ...soloAdmin, async (_req, res) => {
  const [rows] = await pool.execute('SELECT * FROM AULA ORDER BY nom_aula');
  res.json({ aules: rows });
});

// GET /api/admin/professors
router.get('/professors', ...soloAdmin, async (_req, res) => {
  const [rows] = await pool.execute(`
    SELECT p.id_profesor, u.nom_usuari, p.especialitat
    FROM   PROFESOR p JOIN USUARI u ON p.id_usuari = u.id_usuari
    ORDER BY u.nom_usuari
  `);
  res.json({ professors: rows });
});

// GET /api/admin/assignatures
router.get('/assignatures', ...soloAdmin, async (_req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM ASIGNATURA ORDER BY nom_asignatura'
  );
  res.json({ assignatures: rows });
});

// ─────────────────────────────────────────────────────────────────────────────
// HORARIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/horaris[?any_escolar=2025/2026]
 * Retorna TOTS els horaris de tots els grups per a un any escolar.
 * Si no s'especifica any_escolar, usa el curs actual.
 */
router.get('/horaris', ...soloAdmin, async (req, res) => {
  const any_escolar = resoldrAnyEscolar(req);

  const [rows] = await pool.execute(`
    SELECT
      h.id_horari,
      h.dia_semana,
      h.hora_inici,
      h.hora_fi,
      h.grup,
      h.any_escolar,
      a.nom_asignatura,
      u.nom_usuari AS nom_professor,
      au.nom_aula
    FROM   HORARI_LECTIU h
    JOIN   ASIGNATURA a  ON h.id_asignatura = a.id_asignatura
    JOIN   PROFESOR   p  ON h.id_profesor   = p.id_profesor
    JOIN   USUARI     u  ON p.id_usuari     = u.id_usuari
    JOIN   AULA       au ON h.id_aula       = au.id_aula
    WHERE  h.any_escolar = ?
    ORDER BY
      FIELD(h.dia_semana,'Dilluns','Dimarts','Dimecres','Dijous','Divendres'),
      h.hora_inici
  `, [any_escolar]);

  res.json({ any_escolar, horaris: rows });
});

/**
 * DELETE /api/admin/horaris/:id
 * Elimina una franja horària per ID (l'any_escolar no cal perquè l'ID és únic).
 */
router.delete('/horaris/:id', ...soloAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID no vàlid.' });
  }

  const [[horari]] = await pool.execute(`
    SELECT h.id_horari, a.nom_asignatura, h.dia_semana, h.grup, h.any_escolar
    FROM   HORARI_LECTIU h
    JOIN   ASIGNATURA a ON h.id_asignatura = a.id_asignatura
    WHERE  h.id_horari = ?
  `, [id]);

  if (!horari) {
    return res.status(404).json({ error: 'Franja horària no trobada.' });
  }

  await pool.execute('DELETE FROM HORARI_LECTIU WHERE id_horari = ?', [id]);

  res.json({
    missatge: `Franja eliminada: ${horari.nom_asignatura} · ${horari.dia_semana} · ${horari.grup} (${horari.any_escolar})`,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITATS EXTRAESCOLARS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/activitats
 * Crea una nova activitat extraescolar per a l'any escolar actual.
 * L'admin pot passar any_escolar al body per crear-la per a un curs futur.
 */
router.post('/activitats', ...soloAdmin, async (req, res) => {
  const {
    nom, dia_semana, hora_inici, hora_fi,
    id_aula, responsable, places_maximes,
  } = req.body;

  if (!nom || !hora_inici || !hora_fi || !responsable || !places_maximes) {
    return res.status(400).json({ error: 'Falten camps obligatoris.' });
  }

  const any_escolar = resoldrAnyEscolar(req);

  const [result] = await pool.execute(`
    INSERT INTO ACTIVITAT_EXTRAESCOLAR
      (nom, dia_semana, hora_inici, hora_fi, id_aula, responsable, places_maximes, any_escolar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    nom,
    dia_semana  || null,
    hora_inici,
    hora_fi,
    id_aula     || null,
    responsable,
    places_maximes,
    any_escolar,
  ]);

  res.status(201).json({ id_activitat: result.insertId, any_escolar });
});

/**
 * DELETE /api/admin/activitats/:id
 * Elimina una activitat extraescolar per ID.
 * No pot eliminar-se si té inscripcions actives.
 */
router.delete('/activitats/:id', ...soloAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID no vàlid.' });
  }

  const [[activitat]] = await pool.execute(
    'SELECT id_activitat, nom, any_escolar FROM ACTIVITAT_EXTRAESCOLAR WHERE id_activitat = ?',
    [id]
  );

  if (!activitat) {
    return res.status(404).json({ error: 'Activitat no trobada.' });
  }

  // Comprovem si té inscripcions actives
  const [[{ total }]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM INSCRIPCIO_ACTIVITAT WHERE id_activitat = ?',
    [id]
  );

  if (total > 0) {
    return res.status(409).json({
      error:  `No es pot eliminar "${activitat.nom}" (${activitat.any_escolar}).`,
      detall: `Té ${total} inscripció${total > 1 ? 'ns' : ''} activa${total > 1 ? 's' : ''}. ` +
              `Elimina primer les inscripcions o desactiva l'activitat.`,
    });
  }

  await pool.execute('DELETE FROM ACTIVITAT_EXTRAESCOLAR WHERE id_activitat = ?', [id]);
  res.json({
    missatge: `Activitat "${activitat.nom}" (${activitat.any_escolar}) eliminada correctament.`,
  });
});

module.exports = router;
