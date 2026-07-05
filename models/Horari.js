'use strict';

const pool = require('../config/db');
const { getAnyEscolarActiu } = require('../utils/anyEscolar');

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

function fmt(t) { return t ? String(t).substring(0, 5) : '?'; }

// ── Conflicte d'AULA ──────────────────────────────────────────────────────────
async function obtenirConflicteAula(id_aula, dia_semana, hora_inici, hora_fi, any_escolar) {
  const [rows] = await pool.execute(`
    SELECT h.id_horari, h.hora_inici, h.hora_fi, h.grup,
           au.nom_aula
    FROM   HORARI_LECTIU h
    LEFT JOIN AULA au ON h.id_aula = au.id_aula
    WHERE  h.id_aula    = ?
      AND  h.dia_semana  = ?
      AND  h.any_escolar = ?
      AND  h.hora_inici  < ?
      AND  h.hora_fi     > ?
    LIMIT 1
  `, [id_aula, dia_semana, any_escolar, hora_fi, hora_inici]);
  return rows[0] || null;
}

// ── Conflicte de PROFESSOR (via HORARI_PROFESSOR, substitut inclòs) ───────────
async function obtenirConflicteProf(id_professor_actiu, dia_semana, hora_inici, hora_fi, any_escolar) {
  const [rows] = await pool.execute(`
    SELECT h.id_horari, h.hora_inici, h.hora_fi, h.grup,
           p.nom AS nom_professor
    FROM   HORARI_LECTIU    h
    JOIN   HORARI_PROFESSOR hp ON hp.id_horari    = h.id_horari
    JOIN   PROFESSOR        p  ON hp.id_professor = p.id_professor
    WHERE  COALESCE(hp.id_substitut, hp.id_professor) = ?
      AND  h.dia_semana  = ?
      AND  h.any_escolar = ?
      AND  h.hora_inici  < ?
      AND  h.hora_fi     > ?
    LIMIT 1
  `, [id_professor_actiu, dia_semana, any_escolar, hora_fi, hora_inici]);
  return rows[0] || null;
}

const Horari = {

  RE_HORA,

  // ── GET per grup ─────────────────────────────────────────────────────────────
  async getByGrup(grup, any_escolar) {
    const any = any_escolar || getAnyEscolarActiu();
    const [rows] = await pool.execute(`
      SELECT
        h.*,
        a.nom_asignatura,
        a.color_calendari,
        au.nom_aula,
        (
          SELECT CASE
            WHEN p2.en_baixa = 1 AND p2.id_substitut IS NOT NULL
              THEN (SELECT pg.nom FROM PROFESSOR pg WHERE pg.id_professor = p2.id_substitut)
            ELSE COALESCE(
              (SELECT ps2.nom FROM PROFESSOR ps2 WHERE ps2.id_professor = hp2.id_substitut),
              p2.nom
            )
          END
          FROM   HORARI_PROFESSOR hp2
          JOIN   PROFESSOR        p2 ON hp2.id_professor = p2.id_professor
          WHERE  hp2.id_horari = h.id_horari AND hp2.rol = 'Titular'
          LIMIT 1
        ) AS nom_professor,
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'id_professor', hp3.id_professor,
            'nom',          p3.nom,
            'rol',          hp3.rol,
            'en_baixa',     p3.en_baixa,
            'id_substitut', hp3.id_substitut,
            'id_aula',      hp3.id_aula,
            'nom_actiu',    CASE
              WHEN p3.en_baixa = 1 AND psg.id_professor IS NOT NULL THEN psg.nom
              WHEN ps.id_professor IS NOT NULL THEN ps.nom
              ELSE p3.nom
            END
          ))
          FROM   HORARI_PROFESSOR hp3
          JOIN   PROFESSOR        p3  ON hp3.id_professor = p3.id_professor
          LEFT JOIN PROFESSOR     ps  ON hp3.id_substitut = ps.id_professor
          LEFT JOIN PROFESSOR     psg ON p3.id_substitut  = psg.id_professor
          WHERE  hp3.id_horari = h.id_horari
        ) AS professors_json
      FROM   HORARI_LECTIU h
      JOIN   ASIGNATURA  a  ON h.id_asignatura = a.id_asignatura
      LEFT JOIN AULA     au ON h.id_aula        = au.id_aula
      WHERE  h.grup = ? AND h.any_escolar = ?
      ORDER BY
        FIELD(h.dia_semana,'Dilluns','Dimarts','Dimecres','Dijous','Divendres'),
        h.hora_inici
    `, [grup, any]);

    return rows.map(r => ({
      ...r,
      professors: Array.isArray(r.professors_json)
        ? r.professors_json
        : (r.professors_json ? JSON.parse(r.professors_json) : []),
    }));
  },

  // ── GET per professor ─────────────────────────────────────────────────────────
  async getByProfessor(id_professor, any_escolar) {
    const any = any_escolar || getAnyEscolarActiu();
    const [rows] = await pool.execute(`
      SELECT
        h.*,
        a.nom_asignatura,
        a.color_calendari,
        au.nom_aula,
        (SELECT p2.nom FROM PROFESSOR p2 WHERE p2.id_professor = ?) AS nom_professor,
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'id_professor', hp3.id_professor,
            'nom',          p3.nom,
            'rol',          hp3.rol,
            'en_baixa',     p3.en_baixa,
            'id_substitut', hp3.id_substitut,
            'id_aula',      hp3.id_aula,
            'nom_actiu',    CASE
              WHEN p3.en_baixa = 1 AND psg.id_professor IS NOT NULL THEN psg.nom
              WHEN ps.id_professor IS NOT NULL THEN ps.nom
              ELSE p3.nom
            END
          ))
          FROM   HORARI_PROFESSOR hp3
          JOIN   PROFESSOR        p3  ON hp3.id_professor = p3.id_professor
          LEFT JOIN PROFESSOR     ps  ON hp3.id_substitut = ps.id_professor
          LEFT JOIN PROFESSOR     psg ON p3.id_substitut  = psg.id_professor
          WHERE  hp3.id_horari = h.id_horari
        ) AS professors_json
      FROM   HORARI_LECTIU h
      JOIN   ASIGNATURA    a  ON h.id_asignatura = a.id_asignatura
      LEFT JOIN AULA       au ON h.id_aula        = au.id_aula
      WHERE  h.any_escolar = ?
        AND  EXISTS (
          SELECT 1 FROM HORARI_PROFESSOR hp
          WHERE  hp.id_horari = h.id_horari
            AND  COALESCE(hp.id_substitut, hp.id_professor) = ?
        )
      ORDER BY
        FIELD(h.dia_semana,'Dilluns','Dimarts','Dimecres','Dijous','Divendres'),
        h.hora_inici
    `, [id_professor, any, id_professor]);

    return rows.map(r => ({
      ...r,
      professors: Array.isArray(r.professors_json)
        ? r.professors_json
        : (r.professors_json ? JSON.parse(r.professors_json) : []),
    }));
  },

  // ── Comprovació solapaments ───────────────────────────────────────────────────
  // Nota: el solapament de GRUP no es comprova — els desdoblamens estan permesos.
  async comprovarSolapament({ dia_semana, hora_inici, hora_fi, id_aula, professors, any_escolar }) {
    const any = any_escolar || getAnyEscolarActiu();
    const conflictes = [];

    if (id_aula) {
      const c = await obtenirConflicteAula(id_aula, dia_semana, hora_inici, hora_fi, any);
      if (c) conflictes.push(
        `[AULA] "${c.nom_aula}" ja ocupada per ${c.grup} (${fmt(c.hora_inici)}–${fmt(c.hora_fi)})`
      );
    }

    for (const { id_professor: pid, id_substitut: sid } of (professors || [])) {
      if (!pid) continue;
      const actiu = sid || pid;
      const c = await obtenirConflicteProf(actiu, dia_semana, hora_inici, hora_fi, any);
      if (c) conflictes.push(
        `[PROFESSOR] "${c.nom_professor}" ja assignat a ${c.grup} (${fmt(c.hora_inici)}–${fmt(c.hora_fi)})`
      );
    }

    return conflictes;
  },

  // ── Crear franja + assignar professors ───────────────────────────────────────
  async crear({ dia_semana, hora_inici, hora_fi, id_asignatura, id_aula, grup, any_escolar, professors = [] }) {
    const any = any_escolar || getAnyEscolarActiu();
    const [r] = await pool.execute(`
      INSERT INTO HORARI_LECTIU
        (dia_semana, hora_inici, hora_fi, id_asignatura, id_aula, grup, any_escolar)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      dia_semana, hora_inici, hora_fi,
      Number(id_asignatura),
      id_aula ? Number(id_aula) : null,
      grup, any,
    ]);

    const id_horari = r.insertId;
    for (const { id_professor, rol = 'Titular', id_substitut = null, id_aula = null } of professors) {
      try {
        await pool.execute(
          'INSERT IGNORE INTO HORARI_PROFESSOR (id_horari, id_professor, rol, id_substitut, id_aula) VALUES (?, ?, ?, ?, ?)',
          [id_horari, Number(id_professor), rol,
           id_substitut ? Number(id_substitut) : null,
           id_aula      ? Number(id_aula)      : null]
        );
      } catch (err) {
        console.error(
          `[Horari.crear] Error INSERT HORARI_PROFESSOR id_horari=${id_horari} id_professor=${id_professor} rol=${rol} id_aula=${id_aula}:`,
          err.message
        );
        throw err;
      }
    }

    return id_horari;
  },

  // ── Actualitzar franja (multi-grup) + reconstruir professors ─────────────────
  // `grups` és un array de noms de grup. Si s'ometen, s'usa el grup actual de la fila `id`.
  // Troba totes les files "germanes" (mateix slot: dia/hora/asig/any) i les sincronitza:
  //  - Actualitza les files cuyo grup segueix en `grups`
  //  - Esborra les files cuyo grup ha estat eliminat de `grups`
  //  - Crea noves files per als nous grups
  //  - Reconstrueix professors per a totes les files supervivents
  async actualitzar(id, { dia_semana, hora_inici, hora_fi, id_asignatura, id_aula, grups = [], professors = [] }) {
    // 1. Obtenir la fila original per saber any_escolar i el slot actual
    const [[orig]] = await pool.execute(
      'SELECT any_escolar, dia_semana, hora_inici, hora_fi, id_asignatura, grup FROM HORARI_LECTIU WHERE id_horari = ?',
      [id]
    );
    if (!orig) return 0;

    // Si no s'han passat grups, usar el grup actual com a valor per defecte
    const grupsEfectius = grups.length ? grups : [orig.grup];

    const any       = orig.any_escolar;
    const newAsigId = Number(id_asignatura);
    const newAulaId = id_aula ? Number(id_aula) : null;

    // 2. Trobar totes les files germanes pel slot original
    const [siblings] = await pool.execute(`
      SELECT id_horari, grup FROM HORARI_LECTIU
      WHERE dia_semana = ? AND hora_inici = ? AND hora_fi = ?
        AND id_asignatura = ? AND any_escolar = ?
    `, [orig.dia_semana, orig.hora_inici, orig.hora_fi, orig.id_asignatura, any]);

    const grupsSet    = new Set(grupsEfectius);
    const existingMap = new Map(siblings.map(s => [s.grup, s.id_horari]));
    const allIds      = [];

    // 3. Actualitzar les files germanes que continuen; esborrar les que s'han tret
    for (const [g, hid] of existingMap.entries()) {
      if (grupsSet.has(g)) {
        await pool.execute(
          'UPDATE HORARI_LECTIU SET dia_semana=?,hora_inici=?,hora_fi=?,id_asignatura=?,id_aula=? WHERE id_horari=?',
          [dia_semana, hora_inici, hora_fi, newAsigId, newAulaId, hid]
        );
        allIds.push(hid);
      } else {
        await pool.execute('DELETE FROM HORARI_LECTIU WHERE id_horari=?', [hid]);
      }
    }

    // 4. Crear files per als grups nous (no existien prèviament)
    for (const g of grupsEfectius) {
      if (!existingMap.has(g)) {
        const [r] = await pool.execute(
          'INSERT INTO HORARI_LECTIU (dia_semana,hora_inici,hora_fi,id_asignatura,id_aula,grup,any_escolar) VALUES (?,?,?,?,?,?,?)',
          [dia_semana, hora_inici, hora_fi, newAsigId, newAulaId, g, any]
        );
        allIds.push(r.insertId);
      }
    }

    // 5. Reconstruir professors per a totes les files supervivents
    for (const hid of allIds) {
      await pool.execute('DELETE FROM HORARI_PROFESSOR WHERE id_horari=?', [hid]);
      for (const { id_professor, rol = 'Titular', id_substitut = null, id_aula = null } of professors) {
        try {
          await pool.execute(
            'INSERT IGNORE INTO HORARI_PROFESSOR (id_horari,id_professor,rol,id_substitut,id_aula) VALUES (?,?,?,?,?)',
            [hid, Number(id_professor), rol,
             id_substitut ? Number(id_substitut) : null,
             id_aula      ? Number(id_aula)      : null]
          );
        } catch (err) {
          console.error(
            `[Horari.actualitzar] Error INSERT HORARI_PROFESSOR id_horari=${hid} id_professor=${id_professor} rol=${rol} id_aula=${id_aula}:`,
            err.message
          );
          throw err;
        }
      }
    }

    return allIds.length;
  },

  // ── Gestió N:M professors ─────────────────────────────────────────────────────
  async afegirProfessor(id_horari, id_professor, rol = 'Titular', id_substitut = null) {
    const [r] = await pool.execute(`
      INSERT INTO HORARI_PROFESSOR (id_horari, id_professor, rol, id_substitut)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE rol = VALUES(rol)
    `, [id_horari, id_professor, rol, id_substitut]);
    return r.insertId || r.affectedRows;
  },

  async eliminarProfessorDeHorari(id_horari, id_professor) {
    const [r] = await pool.execute(
      'DELETE FROM HORARI_PROFESSOR WHERE id_horari = ? AND id_professor = ?',
      [id_horari, id_professor]
    );
    return r.affectedRows;
  },

  async actualitzarSubstitut(id_horari, id_professor, id_substitut) {
    const [r] = await pool.execute(
      'UPDATE HORARI_PROFESSOR SET id_substitut = ? WHERE id_horari = ? AND id_professor = ?',
      [id_substitut || null, id_horari, id_professor]
    );
    return r.affectedRows;
  },

  // ── Eliminar franja (CASCADE elimina HORARI_PROFESSOR) ───────────────────────
  async eliminar(id) {
    const [r] = await pool.execute(
      'DELETE FROM HORARI_LECTIU WHERE id_horari = ?', [id]
    );
    return r.affectedRows;
  },
};

module.exports = Horari;
