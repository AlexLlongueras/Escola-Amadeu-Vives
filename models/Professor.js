'use strict';

const pool = require('../config/db');

const Professor = {

  async llistar() {
    const [rows] = await pool.execute(`
      SELECT p.*,
             s.nom AS nom_substitut
      FROM   PROFESSOR p
      LEFT JOIN PROFESSOR s ON p.id_substitut = s.id_professor
      ORDER  BY p.nom
    `);
    return rows;
  },

  async getById(id) {
    const [[row]] = await pool.execute(
      'SELECT * FROM PROFESSOR WHERE id_professor = ?', [id]
    );
    return row || null;
  },

  async crear({ nom, especialitat, email }) {
    const [r] = await pool.execute(
      'INSERT INTO PROFESSOR (nom, especialitat, email) VALUES (?, ?, ?)',
      [nom.trim(), especialitat?.trim() || null, email?.trim() || null]
    );
    return r.insertId;
  },

  async actualitzar(id, { nom, especialitat, email }) {
    const [r] = await pool.execute(
      'UPDATE PROFESSOR SET nom = ?, especialitat = ?, email = ? WHERE id_professor = ?',
      [nom.trim(), especialitat?.trim() || null, email?.trim() || null, id]
    );
    return r.affectedRows;
  },

  async gestionarBaixa(id, en_baixa, id_substitut) {
    const [r] = await pool.execute(
      'UPDATE PROFESSOR SET en_baixa = ?, id_substitut = ? WHERE id_professor = ?',
      [en_baixa ? 1 : 0, id_substitut || null, id]
    );
    return r.affectedRows;
  },

  async eliminar(id) {
    // Desvincula horaris i classes temporals (ON DELETE SET NULL ho fa la BD,
    // però ho fem explícit per claredat)
    await pool.execute(
      'UPDATE HORARI_LECTIU SET id_professor = NULL WHERE id_professor = ?', [id]
    );
    await pool.execute(
      'UPDATE CLASSES_TEMPORALS SET id_professor = NULL WHERE id_professor = ?', [id]
    );
    const [r] = await pool.execute(
      'DELETE FROM PROFESSOR WHERE id_professor = ?', [id]
    );
    return r.affectedRows;
  },
};

module.exports = Professor;
