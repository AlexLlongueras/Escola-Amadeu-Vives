'use strict';

const pool = require('../config/db');

const ConfiguracioCurs = {

  async llistar() {
    const [rows] = await pool.execute(
      'SELECT * FROM CONFIGURACIO_CURS ORDER BY data_inici DESC'
    );
    return rows;
  },

  async getActiu() {
    const [[row]] = await pool.execute(
      'SELECT * FROM CONFIGURACIO_CURS WHERE actiu = 1 LIMIT 1'
    );
    return row || null;
  },

  async crear({ any_escolar, data_inici, data_fi }) {
    const [r] = await pool.execute(
      'INSERT INTO CONFIGURACIO_CURS (any_escolar, data_inici, data_fi, actiu) VALUES (?, ?, ?, 0)',
      [any_escolar, data_inici, data_fi]
    );
    return r.insertId;
  },

  async activar(id) {
    // Desactiva tots i activa el seleccionat
    await pool.execute('UPDATE CONFIGURACIO_CURS SET actiu = 0');
    const [r] = await pool.execute(
      'UPDATE CONFIGURACIO_CURS SET actiu = 1 WHERE id_curs = ?', [id]
    );
    return r.affectedRows;
  },

  async actualitzarDates(id_curs, { data_inici, data_fi }) {
    const [r] = await pool.execute(
      'UPDATE CONFIGURACIO_CURS SET data_inici = ?, data_fi = ? WHERE id_curs = ?',
      [data_inici, data_fi, id_curs]
    );
    return r.affectedRows;
  },

  async eliminar(id) {
    const [r] = await pool.execute(
      'DELETE FROM CONFIGURACIO_CURS WHERE id_curs = ? AND actiu = 0', [id]
    );
    return r.affectedRows;
  },
};

module.exports = ConfiguracioCurs;
