'use strict';

const express    = require('express');
const router     = express.Router();
const pool       = require('../config/db');
const Professor  = require('../models/Professor');
const Grup       = require('../models/Grup');
const Horari     = require('../models/Horari');
const { verificarToken } = require('../middleware/authMiddleware');
const { getAnyEscolarActiu, validarAnyEscolar } = require('../utils/anyEscolar');

const auth = [verificarToken];

function anyParam(req) {
  const c = req.query.any_escolar || req.body?.any_escolar;
  return (c && validarAnyEscolar(c)) ? c : getAnyEscolarActiu();
}

// ── Catalegs ─────────────────────────────────────────────────────────────────

router.get('/aules', ...auth, async (_req, res) => {
  const [rows] = await pool.execute('SELECT * FROM AULA ORDER BY nom_aula');
  res.json({ aules: rows });
});

router.get('/assignatures', ...auth, async (_req, res) => {
  const [rows] = await pool.execute('SELECT * FROM ASIGNATURA ORDER BY nom_asignatura');
  res.json({ assignatures: rows });
});

// ── Aules CRUD ────────────────────────────────────────────────────────────────

router.post('/aules', ...auth, async (req, res) => {
  const { nom_aula, capacitat, tipo } = req.body;
  if (!nom_aula?.trim()) return res.status(400).json({ error: 'nom_aula es obligatori.' });
  const [r] = await pool.execute(
    'INSERT INTO AULA (nom_aula, capacitat, tipo) VALUES (?, ?, ?)',
    [nom_aula.trim(), capacitat ? Number(capacitat) : null, tipo?.trim() || 'clase']
  );
  res.status(201).json({ id_aula: r.insertId });
});

router.delete('/aules/:id', ...auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID no valid.' });
  const [r] = await pool.execute('DELETE FROM AULA WHERE id_aula = ?', [id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Aula no trobada.' });
  res.json({ missatge: 'Aula eliminada.' });
});

// ── Assignatures CRUD ─────────────────────────────────────────────────────────

router.post('/assignatures', ...auth, async (req, res) => {
  const { nom_asignatura, color_calendari } = req.body;
  if (!nom_asignatura?.trim()) return res.status(400).json({ error: 'nom_asignatura es obligatori.' });
  const [r] = await pool.execute(
    'INSERT INTO ASIGNATURA (nom_asignatura, color_calendari) VALUES (?, ?)',
    [nom_asignatura.trim(), color_calendari?.trim() || '#1565c0']
  );
  res.status(201).json({ id_asignatura: r.insertId });
});

router.put('/assignatures/:id', ...auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID no valid.' });
  const { nom_asignatura, color_calendari } = req.body;
  if (!nom_asignatura?.trim()) return res.status(400).json({ error: 'nom_asignatura es obligatori.' });
  const [r] = await pool.execute(
    'UPDATE ASIGNATURA SET nom_asignatura = ?, color_calendari = ? WHERE id_asignatura = ?',
    [nom_asignatura.trim(), color_calendari?.trim() || '#1565c0', id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Matèria no trobada.' });
  res.json({ missatge: 'Matèria actualitzada.' });
});

router.delete('/assignatures/:id', ...auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID no valid.' });
  const [r] = await pool.execute('DELETE FROM ASIGNATURA WHERE id_asignatura = ?', [id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Assignatura no trobada.' });
  res.json({ missatge: 'Assignatura eliminada.' });
});

// ── Professors CRUD ───────────────────────────────────────────────────────────

router.get('/professors', ...auth, async (_req, res) => {
  res.json({ professors: await Professor.llistar() });
});

router.post('/professors', ...auth, async (req, res) => {
  const { nom, especialitat, email } = req.body;
  if (!nom?.trim()) return res.status(400).json({ error: 'El nom es obligatori.' });
  const id = await Professor.crear({ nom, especialitat, email });
  res.status(201).json({ id_professor: id });
});

router.put('/professors/:id', ...auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID no valid.' });
  const { nom, especialitat, email } = req.body;
  if (!nom?.trim()) return res.status(400).json({ error: 'El nom es obligatori.' });
  const n = await Professor.actualitzar(id, { nom, especialitat, email });
  if (!n) return res.status(404).json({ error: 'Professor no trobat.' });
  res.json({ missatge: 'Professor actualitzat.' });
});

router.delete('/professors/:id', ...auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID no valid.' });
  const n = await Professor.eliminar(id);
  if (!n) return res.status(404).json({ error: 'Professor no trobat.' });
  res.json({ missatge: 'Professor eliminat.' });
});

router.put('/professors/:id/baixa', ...auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID no valid.' });
  const { en_baixa, id_substitut } = req.body;
  const n = await Professor.gestionarBaixa(id, en_baixa, id_substitut);
  if (!n) return res.status(404).json({ error: 'Professor no trobat.' });
  res.json({ missatge: en_baixa ? 'Baixa activada.' : 'Baixa desactivada.' });
});

// ── Grups CRUD ────────────────────────────────────────────────────────────────

router.get('/grups', ...auth, async (req, res) => {
  // ?all=true → retorna tots els grups de tots els cursos (per a la vista d'admin)
  if (req.query.all === 'true') {
    const [rows] = await pool.execute(
      'SELECT * FROM GRUPS_CLASSE ORDER BY any_escolar DESC, nom'
    );
    return res.json({ grups: rows });
  }
  const any = anyParam(req);
  res.json({ any_escolar: any, grups: await Grup.llistar(any) });
});

router.post('/grups', ...auth, async (req, res) => {
  const { nom, curs } = req.body;
  const any = anyParam(req);
  if (!nom?.trim()) return res.status(400).json({ error: 'El nom es obligatori.' });
  const id = await Grup.crear({ nom, curs, any_escolar: any });
  res.status(201).json({ id_grup: id, any_escolar: any });
});

router.delete('/grups/:id', ...auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID no valid.' });
  const n = await Grup.eliminar(id);
  if (!n) return res.status(404).json({ error: 'Grup no trobat.' });
  res.json({ missatge: 'Grup eliminat.' });
});

// ── Horaris (admin: tots els grups) ──────────────────────────────────────────

router.get('/horaris', ...auth, async (req, res) => {
  const any = anyParam(req);
  const [rows] = await pool.execute(`
    SELECT
      h.*,
      a.nom_asignatura,
      au.nom_aula,
      GROUP_CONCAT(
        p.nom ORDER BY hp.rol
        SEPARATOR ', '
      ) AS nom_professor
    FROM   HORARI_LECTIU h
    JOIN   ASIGNATURA       a  ON h.id_asignatura = a.id_asignatura
    LEFT JOIN AULA          au ON h.id_aula        = au.id_aula
    LEFT JOIN HORARI_PROFESSOR hp ON hp.id_horari  = h.id_horari
    LEFT JOIN PROFESSOR     p  ON hp.id_professor  = p.id_professor
    WHERE  h.any_escolar = ?
    GROUP BY h.id_horari
    ORDER BY FIELD(h.dia_semana,'Dilluns','Dimarts','Dimecres','Dijous','Divendres'), h.hora_inici
  `, [any]);
  res.json({ any_escolar: any, horaris: rows });
});

router.delete('/horaris/:id', ...auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID no valid.' });
  const n = await Horari.eliminar(id);
  if (!n) return res.status(404).json({ error: 'Horari no trobat.' });
  res.json({ missatge: 'Horari eliminat.' });
});

module.exports = router;
