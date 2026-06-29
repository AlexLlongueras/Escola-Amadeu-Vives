// models/Horari.js
// Accés a dades per a HORARI_LECTIU i taules relacionades.
//
// CANVI v3: missatges de solapament DETALLATS
//   En lloc d'indicar "l'aula 3 està ocupada", el sistema retorna:
//   "Aula 2n B (Llengua Catalana) 09:00–10:00 · Jordi Sala"
//   Això ajuda l'administrador a identificar i resoldre el conflicte ràpidament.
//
// VALIDACIONS IMPLEMENTADES (requeriment tribunal TFG):
//   A. Xoc de Professor — mateix professor, dia, franja i any escolar
//   B. Xoc d'Aula       — mateixa aula, dia, franja i any escolar
//   C. Xoc de Grup      — mateix grup, dia, franja i any escolar
//   Tots 3 amb filtre per any_escolar → NO es generen conflictes entre anys!
//
// La condició de solapament parcial és:
//   hora_inici_existent < hora_fi_nova  AND  hora_fi_existent > hora_inici_nova
// Captura: solapament total, parcial, contenció i inversió.

'use strict';

const pool                  = require('../config/db');
const { obtenirAnyEscolar } = require('../utils/anyEscolar');

// ─────────────────────────────────────────────────────────────────────────────
// Funció interna: busca UNA franja en conflicte per a un recurs concret
// i retorna els seus detalls complets (o null si no hi ha conflicte).
//
// El JOIN retorna noms llegibles (nom_aula, nom_professor, nom_asignatura)
// per poder generar missatges d'error descriptius.
// ─────────────────────────────────────────────────────────────────────────────
async function obtenirConflicte(camp, valor, dia_semana, hora_inici, hora_fi, any_escolar) {
  // NOTA DE SEGURETAT: `camp` mai ve de l'usuari — és un nom de columna
  // hardcoded a la funció comprovarSolapament (id_aula, id_profesor, grup).
  const sql = `
    SELECT
      h.id_horari,
      h.dia_semana,
      h.hora_inici,
      h.hora_fi,
      h.grup,
      a.nom_asignatura,
      u.nom_usuari  AS nom_professor,
      au.nom_aula
    FROM  HORARI_LECTIU h
    JOIN  ASIGNATURA  a  ON h.id_asignatura = a.id_asignatura
    JOIN  PROFESOR    p  ON h.id_profesor   = p.id_profesor
    JOIN  USUARI      u  ON p.id_usuari     = u.id_usuari
    JOIN  AULA        au ON h.id_aula       = au.id_aula
    WHERE  h.${camp}      = ?
      AND  h.dia_semana   = ?
      AND  h.any_escolar  = ?
      AND  h.hora_inici   < ?
      AND  h.hora_fi      > ?
    LIMIT 1
  `;
  // Ordre: valor, dia, any, hora_fi_nova, hora_inici_nova
  // hora_inici_existent < hora_fi_nova    → l'existent comença abans que acabi el nou
  // hora_fi_existent    > hora_inici_nova → l'existent acaba després que comenci el nou
  const [rows] = await pool.execute(sql, [valor, dia_semana, any_escolar, hora_fi, hora_inici]);
  return rows.length > 0 ? rows[0] : null;
}

// Formata una hora 'HH:MM:SS' → 'HH:MM'
function fmtHora(t) {
  return t ? t.substring(0, 5) : '?';
}

const Horari = {

  /**
   * Comprova els 3 conflictes (aula, professor, grup) de forma independent
   * i retorna UN ARRAY amb TOTS els conflictes trobats (no s'atura al primer).
   *
   * IMPORTANT: el filtre per any_escolar garanteix que una aula o professor
   * que tenia classe el 2024/2025 NO genera conflicte el 2025/2026.
   *
   * @param {{ dia_semana, hora_inici, hora_fi, id_aula, id_profesor, grup, any_escolar }}
   * @returns {Promise<string[]>} Array de missatges d'error (buit = sense conflictes)
   */
  async comprovarSolapament({ dia_semana, hora_inici, hora_fi, id_aula, id_profesor, grup, any_escolar }) {
    const any = any_escolar || obtenirAnyEscolar();
    const conflictes = [];

    // ── A. Xoc d'AULA ─────────────────────────────────────────────────────────
    // Dos grups no poden estar a la mateixa aula a la mateixa hora
    const cAula = await obtenirConflicte('id_aula', id_aula, dia_semana, hora_inici, hora_fi, any);
    if (cAula) {
      conflictes.push(
        `[AULA] "${cAula.nom_aula}" ja ocupada per ${cAula.grup} ` +
        `(${cAula.nom_asignatura}, ${fmtHora(cAula.hora_inici)}–${fmtHora(cAula.hora_fi)}, ` +
        `prof. ${cAula.nom_professor}) — curs ${any}.`
      );
    }

    // ── B. Xoc de PROFESSOR ────────────────────────────────────────────────────
    // Un professor no pot ser a dos llocs alhora
    const cProf = await obtenirConflicte('id_profesor', id_profesor, dia_semana, hora_inici, hora_fi, any);
    if (cProf) {
      conflictes.push(
        `[PROFESSOR] ${cProf.nom_professor} ja té classe a ${cProf.grup} ` +
        `(${cProf.nom_asignatura}, ${fmtHora(cProf.hora_inici)}–${fmtHora(cProf.hora_fi)}, ` +
        `aula ${cProf.nom_aula}) — curs ${any}.`
      );
    }

    // ── C. Xoc de GRUP ────────────────────────────────────────────────────────
    // Un grup no pot tenir dues assignatures a la mateixa hora
    const cGrup = await obtenirConflicte('grup', grup, dia_semana, hora_inici, hora_fi, any);
    if (cGrup) {
      conflictes.push(
        `[GRUP] El grup "${cGrup.grup}" ja té ${cGrup.nom_asignatura} ` +
        `(${fmtHora(cGrup.hora_inici)}–${fmtHora(cGrup.hora_fi)}, ` +
        `aula ${cGrup.nom_aula}, prof. ${cGrup.nom_professor}) — curs ${any}.`
      );
    }

    return conflictes;
  },

  /**
   * Retorna l'horari complet d'un grup per a un any escolar concret.
   *
   * @param {string} grup        Ex: '1r A'
   * @param {string} any_escolar Ex: '2025/2026'
   */
  async getByGrup(grup, any_escolar) {
    const any = any_escolar || obtenirAnyEscolar();
    const sql = `
      SELECT
        h.id_horari,
        h.dia_semana,
        h.hora_inici,
        h.hora_fi,
        h.grup,
        h.any_escolar,
        a.nom_asignatura,
        a.color_calendari,
        u.nom_usuari  AS nom_professor,
        au.nom_aula
      FROM  HORARI_LECTIU h
      JOIN  ASIGNATURA  a  ON h.id_asignatura = a.id_asignatura
      JOIN  PROFESOR    p  ON h.id_profesor   = p.id_profesor
      JOIN  USUARI      u  ON p.id_usuari     = u.id_usuari
      JOIN  AULA        au ON h.id_aula       = au.id_aula
      WHERE h.grup        = ?
        AND h.any_escolar = ?
      ORDER BY
        FIELD(h.dia_semana,'Dilluns','Dimarts','Dimecres','Dijous','Divendres'),
        h.hora_inici
    `;
    const [rows] = await pool.execute(sql, [grup, any]);
    return rows;
  },

  /**
   * Insereix una nova franja horària per a un any escolar específic.
   * SEMPRE cridar comprovarSolapament abans d'invocar aquest mètode.
   */
  async create({ dia_semana, hora_inici, hora_fi, id_asignatura, id_profesor, id_aula, grup, any_escolar }) {
    const any = any_escolar || obtenirAnyEscolar();
    const sql = `
      INSERT INTO HORARI_LECTIU
        (dia_semana, hora_inici, hora_fi, id_asignatura, id_profesor, id_aula, grup, any_escolar)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [
      dia_semana, hora_inici, hora_fi,
      id_asignatura, id_profesor, id_aula,
      grup, any,
    ]);
    return result.insertId;
  },

  /**
   * Retorna l'horari personal d'un professor per a un any escolar,
   * i la llista de grups que tutoritza aquest any.
   */
  async getByProfesor(id_profesor, any_escolar) {
    const any = any_escolar || obtenirAnyEscolar();

    const sql = `
      SELECT
        h.id_horari,
        h.dia_semana,
        h.hora_inici,
        h.hora_fi,
        h.grup,
        h.any_escolar,
        a.nom_asignatura,
        a.color_calendari,
        u.nom_usuari  AS nom_professor,
        au.nom_aula,
        FALSE         AS es_extraescolar
      FROM  HORARI_LECTIU h
      JOIN  ASIGNATURA  a  ON h.id_asignatura = a.id_asignatura
      JOIN  PROFESOR    p  ON h.id_profesor   = p.id_profesor
      JOIN  USUARI      u  ON p.id_usuari     = u.id_usuari
      JOIN  AULA        au ON h.id_aula       = au.id_aula
      WHERE h.id_profesor  = ?
        AND h.any_escolar  = ?
      ORDER BY
        FIELD(h.dia_semana,'Dilluns','Dimarts','Dimecres','Dijous','Divendres'),
        h.hora_inici
    `;
    const [rows] = await pool.execute(sql, [id_profesor, any]);

    const [grups] = await pool.execute(`
      SELECT g.nom AS grup_tutoritzat
      FROM   GRUPS_CLASSE g
      JOIN   PROFESOR     p ON g.id_tutor   = p.id_profesor
      WHERE  p.id_profesor  = ?
        AND  g.any_escolar  = ?
    `, [id_profesor, any]);

    return {
      any_escolar:       any,
      horaris:           rows,
      grups_tutoritzats: grups.map(g => g.grup_tutoritzat),
    };
  },

  /**
   * Retorna el grup i curs d'un alumne per a un any escolar concret.
   * Si no s'indica any_escolar, usa el curs actual del servidor.
   *
   * IMPORTANT: sempre s'ha de passar any_escolar des del controller perquè
   * Joan al 2024/2025 és a '1r A' però al 2025/2026 és a '2n A'.
   * Sense l'any, sempre retornaríem el grup del curs actual, fent que
   * l'historial d'anys anteriors mostri l'horari equivocat.
   *
   * @param {number} id_usuari
   * @param {string} [any_escolar]  Ex: '2024/2025' — si no ve, usa any actual
   */
  async getGrupByIdUsuari(id_usuari, any_escolar) {
    const any = any_escolar || obtenirAnyEscolar();

    // Intent 1: amb filtre per any_escolar (el que ha demanat el client)
    const [[alumne]] = await pool.execute(`
      SELECT a.id_alumne, a.grup, a.curs
      FROM   ALUMNE a
      WHERE  a.id_usuari   = ?
        AND  a.any_escolar = ?
      LIMIT  1
    `, [id_usuari, any]);

    if (alumne) return alumne;

    // Fallback: sense filtre d'any (BD sense Bloc 4 de la migració, o any sense dades)
    const [[alumneFb]] = await pool.execute(`
      SELECT a.id_alumne, a.grup, a.curs
      FROM   ALUMNE a
      WHERE  a.id_usuari = ?
      ORDER  BY a.any_escolar DESC
      LIMIT  1
    `, [id_usuari]);

    return alumneFb || null;
  },

  /**
   * Retorna els fills vinculats a un familiar.
   */
  async getFillsByFamilia(id_usuari) {
    const [fills] = await pool.execute(`
      SELECT
        al.id_alumne,
        al.grup,
        al.curs,
        u.nom_usuari AS nom_alumne,
        fa.parentesc
      FROM   FAMILIA_ALUMNE fa
      JOIN   ALUMNE         al ON fa.id_alumne  = al.id_alumne
      JOIN   USUARI         u  ON al.id_usuari  = u.id_usuari
      WHERE  fa.id_familia = ?
      ORDER BY u.nom_usuari
    `, [id_usuari]);
    return fills;
  },

};

module.exports = Horari;
