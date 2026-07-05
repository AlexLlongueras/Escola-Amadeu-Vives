'use strict';

// Cache en memòria del curs actiu.
// Es carrega des de la BD en arrencar el servidor i es refresca
// quan l'admin canvia l'any escolar actiu.
let _anyActiu = null;

/**
 * Carrega el curs actiu des de CONFIGURACIO_CURS i l'emmagatzema en memòria.
 * Crida-ho a server.js en arrencar, i des del controller quan s'activa un curs.
 * @returns {Promise<string|null>}
 */
async function carregarAnyEscolarActiu() {
  const pool = require('../config/db');
  const [[row]] = await pool.execute(
    'SELECT any_escolar FROM CONFIGURACIO_CURS WHERE actiu = 1 LIMIT 1'
  );
  _anyActiu = row?.any_escolar ?? null;
  return _anyActiu;
}

/**
 * Retorna el curs actiu des de la caché (sincrón).
 * Si la caché és buida, fa un càlcul de fallback basat en la data del sistema.
 * @returns {string}
 */
function getAnyEscolarActiu() {
  return _anyActiu ?? _calcularAnyEscolar(new Date());
}

/**
 * Càlcul de fallback (no depèn de la BD).
 * @param {Date} data
 * @returns {string}
 */
function _calcularAnyEscolar(data) {
  const mes = data.getMonth() + 1;
  const any = data.getFullYear();
  if (mes >= 9) return `${any}/${any + 1}`;
  if (mes <= 7) return `${any - 1}/${any}`;
  return `${any}/${any + 1}`;
}

/**
 * Alias de compatibilitat per al codi existent que cridava obtenirAnyEscolar().
 * @param {Date} [data]
 * @returns {string}
 */
function obtenirAnyEscolar(data) {
  if (data) return _calcularAnyEscolar(data);
  return getAnyEscolarActiu();
}

/**
 * Valida el format AAAA/AAAA (anys consecutius).
 * @param {string} str
 * @returns {boolean}
 */
function validarAnyEscolar(str) {
  if (typeof str !== 'string') return false;
  const m = str.match(/^(\d{4})\/(\d{4})$/);
  if (!m) return false;
  return parseInt(m[2], 10) === parseInt(m[1], 10) + 1;
}

module.exports = {
  carregarAnyEscolarActiu,
  getAnyEscolarActiu,
  obtenirAnyEscolar,
  validarAnyEscolar,
};
