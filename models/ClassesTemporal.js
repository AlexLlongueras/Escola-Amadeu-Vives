'use strict';

const pool = require('../config/db');

const ClassesTemporal = {

  async getByGrupIAnyEscolar(grup, any_escolar) {
    const [rows] = await pool.execute(`
      SELECT
        ct.*,
        a.nom_asignatura,
        a.color_calendari,
        p.nom           AS nom_professor,
        au.nom_aula
      FROM   CLASSES_TEMPORALS ct
      JOIN   ASIGNATURA  a  ON ct.id_asignatura = a.id_asignatura
      LEFT JOIN PROFESSOR  p  ON ct.id_professor  = p.id_professor
      LEFT JOIN AULA       au ON ct.id_aula        = au.id_aula
      WHERE  ct.grup = ? AND ct.any_escolar = ?
      ORDER BY ct.data, ct.hora_inici
    `, [grup, any_escolar]);
    return rows;
  },

  async getByAnyEscolar(any_escolar) {
    const [rows] = await pool.execute(`
      SELECT
        ct.*,
        a.nom_asignatura,
        a.color_calendari,
        p.nom           AS nom_professor,
        au.nom_aula
      FROM   CLASSES_TEMPORALS ct
      JOIN   ASIGNATURA  a  ON ct.id_asignatura = a.id_asignatura
      LEFT JOIN PROFESSOR  p  ON ct.id_professor  = p.id_professor
      LEFT JOIN AULA       au ON ct.id_aula        = au.id_aula
      WHERE  ct.any_escolar = ?
      ORDER BY ct.data, ct.hora_inici
    `, [any_escolar]);
    return rows;
  },

  async crear({ data, grup, id_asignatura, id_professor, id_aula, hora_inici, hora_fi, any_escolar, nota }) {
    const [r] = await pool.execute(`
      INSERT INTO CLASSES_TEMPORALS
        (data, grup, id_asignatura, id_professor, id_aula, hora_inici, hora_fi, any_escolar, nota)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data, grup,
      Number(id_asignatura),
      id_professor ? Number(id_professor) : null,
      id_aula      ? Number(id_aula)      : null,
      hora_inici, hora_fi,
      any_escolar,
      nota?.trim() || null,
    ]);
    return r.insertId;
  },

  async eliminar(id) {
    const [r] = await pool.execute(
      'DELETE FROM CLASSES_TEMPORALS WHERE id_classe = ?', [id]
    );
    return r.affectedRows;
  },
};

module.exports = ClassesTemporal;
