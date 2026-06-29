// models/DiaEspecial.js
// Accés a la taula DIES_ESPECIALS (festius, excursions, colònies).

'use strict';

const pool = require('../config/db');

const DiaEspecial = {

  /**
   * Retorna els dies especials filtrats per any escolar i grup(s).
   *
   * Modes de filtre:
   *   grup = null    → tots els events del curs (per a la taula d'admin)
   *   grup = string  → centre (grup IS NULL) + events del grup concret
   *   grup = Array   → centre (grup IS NULL) + events de tots els grups del array
   *                    (cas del professor que imparteix a múltiples grups)
   *
   * @param {string}              any_escolar  Ex: '2025/2026'
   * @param {string|string[]|null} grup
   * @returns {Promise<Array>}
   */
  async llistar(any_escolar, grup = null) {

    const SELECT_COLS = `
      SELECT id_dia, nom_esdeveniment, tipus,
             DATE_FORMAT(data_inici, '%Y-%m-%d') AS data_inici,
             DATE_FORMAT(data_fi,    '%Y-%m-%d') AS data_fi,
             grup, any_escolar
      FROM   DIES_ESPECIALS
    `;

    // ── Array de grups (professor multi-grup) ──────────────────────────────
    if (Array.isArray(grup)) {
      if (grup.length === 0) {
        // Sense grups assignats: retornem només events de centre
        const [rows] = await pool.execute(
          `${SELECT_COLS} WHERE any_escolar = ? AND grup IS NULL ORDER BY data_inici, tipus`,
          [any_escolar]
        );
        return rows;
      }
      const placeholders = grup.map(() => '?').join(', ');
      const [rows] = await pool.execute(
        `${SELECT_COLS}
         WHERE  any_escolar = ?
           AND  (grup IS NULL OR grup IN (${placeholders}))
         ORDER  BY data_inici, tipus`,
        [any_escolar, ...grup]
      );
      return rows;
    }

    // ── Un sol grup ────────────────────────────────────────────────────────
    if (grup) {
      const [rows] = await pool.execute(
        `${SELECT_COLS}
         WHERE  any_escolar = ?
           AND  (grup IS NULL OR grup = ?)
         ORDER  BY data_inici, tipus`,
        [any_escolar, grup]
      );
      return rows;
    }

    // ── Sense filtre de grup: tots els events (taula d'admin) ──────────────
    const [rows] = await pool.execute(
      `${SELECT_COLS} WHERE any_escolar = ? ORDER BY data_inici, tipus`,
      [any_escolar]
    );
    return rows;
  },

  /**
   * Insereix un nou dia especial.
   *
   * @param {{
   *   nom_esdeveniment: string,
   *   tipus: 'festiu'|'excursio'|'colonies',
   *   data_inici: string,   // 'YYYY-MM-DD'
   *   data_fi:    string,   // 'YYYY-MM-DD'
   *   grup:       string|null,
   *   any_escolar: string
   * }} dades
   * @returns {Promise<number>}  ID de la nova fila
   */
  async crear(dades) {
    const { nom_esdeveniment, tipus, data_inici, data_fi, grup, any_escolar } = dades;
    const [result] = await pool.execute(`
      INSERT INTO DIES_ESPECIALS
        (nom_esdeveniment, tipus, data_inici, data_fi, grup, any_escolar)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [nom_esdeveniment, tipus, data_inici, data_fi, grup || null, any_escolar]);
    return result.insertId;
  },

  /**
   * Elimina un dia especial per ID.
   *
   * @param {number} id
   * @returns {Promise<number>}  Files afectades (0 = no trobat)
   */
  async eliminar(id) {
    const [result] = await pool.execute(
      'DELETE FROM DIES_ESPECIALS WHERE id_dia = ?',
      [id]
    );
    return result.affectedRows;
  },
};

module.exports = DiaEspecial;
