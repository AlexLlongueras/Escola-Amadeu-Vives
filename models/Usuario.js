// models/Usuario.js
// Funcions d'accés a dades per a l'entitat USUARI.
// Els controllers NO fan queries directes; sempre passen per aquí.

const pool = require('../config/db');

const Usuario = {

  /**
   * Busca un usuari per email. Usat al flux de Login/Autenticació.
   * Retorna la fila completa (inclòs el hash de la password) o null.
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email) {
    const sql = `
      SELECT id_usuari, nom_usuari, email, password, rol
      FROM   USUARI
      WHERE  email = ?
      LIMIT  1
    `;
    const [rows] = await pool.execute(sql, [email]);
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Busca un usuari per ID. Usat per verificar tokens JWT.
   * Retorna les dades públiques (sense password).
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const sql = `
      SELECT id_usuari, nom_usuari, email, rol
      FROM   USUARI
      WHERE  id_usuari = ?
      LIMIT  1
    `;
    const [rows] = await pool.execute(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  },

};

module.exports = Usuario;