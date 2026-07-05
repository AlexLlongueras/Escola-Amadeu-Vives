'use strict';

const pool = require('../config/db');

const Grup = {

  async llistar(any_escolar) {
    const [rows] = await pool.execute(
      'SELECT * FROM GRUPS_CLASSE WHERE any_escolar = ? ORDER BY nom',
      [any_escolar]
    );
    return rows;
  },

  async crear({ nom, curs, any_escolar }) {
    const [r] = await pool.execute(
      'INSERT INTO GRUPS_CLASSE (nom, any_escolar, curs) VALUES (?, ?, ?)',
      [nom.trim(), any_escolar, curs?.trim() || null]
    );
    return r.insertId;
  },

  async eliminar(id) {
    const [r] = await pool.execute(
      'DELETE FROM GRUPS_CLASSE WHERE id_grup = ?', [id]
    );
    return r.affectedRows;
  },
};

module.exports = Grup;
