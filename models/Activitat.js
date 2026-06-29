// models/Activitat.js
// Accés a dades per a ACTIVITAT_EXTRAESCOLAR i INSCRIPCIO_ACTIVITAT.
//
// CANVI v2: totes les consultes filtren per any_escolar.
// Cada any escolar té el seu catàleg d'activitats i les seves inscripcions.
// Les places s'esgoten i es renoven cada any independent.
//
// La validació de places segueix estrictament el diagrama de flux del TFG:
//   1. Consultar places_maximes de l'activitat
//   2. Comptar inscripcions actuals (del mateix any, implícit per id_activitat)
//   3. Si places_lliures > 0 → INSERT a INSCRIPCIO_ACTIVITAT
//   4. Si no               → llançar error de capacitat

'use strict';

const pool                  = require('../config/db');
const { obtenirAnyEscolar } = require('../utils/anyEscolar');

// Formata una hora 'HH:MM:SS' → 'HH:MM'
function fmtHora(t) {
  return t ? t.substring(0, 5) : '?';
}

const Activitat = {

  /**
   * Llista totes les activitats d'un any escolar amb el recompte de
   * places ocupades i places lliures calculades en temps real.
   * Usat per a la vista de cards d'alumne/família.
   *
   * @param {string} any_escolar  Ex: '2025/2026'
   */
  async llistarTotes(any_escolar) {
    const any = any_escolar || obtenirAnyEscolar();
    // NOTA: s'usa un subquery per al COUNT d'inscripcions en lloc de GROUP BY
    // directe per evitar el mode ONLY_FULL_GROUP_BY de MySQL 8, que rebutja
    // columnes de JOIN (au.nom_aula) que no estan al GROUP BY.
    const sql = `
      SELECT
        a.id_activitat,
        a.nom,
        a.dia_semana,
        a.hora_inici,
        a.hora_fi,
        a.responsable,
        a.places_maximes,
        a.any_escolar,
        au.nom_aula,
        COALESCE(cnt.places_ocupades, 0)                              AS places_ocupades,
        (a.places_maximes - COALESCE(cnt.places_ocupades, 0))         AS places_lliures
      FROM      ACTIVITAT_EXTRAESCOLAR a
      LEFT JOIN AULA au ON a.id_aula = au.id_aula
      LEFT JOIN (
        SELECT id_activitat, COUNT(*) AS places_ocupades
        FROM   INSCRIPCIO_ACTIVITAT
        GROUP  BY id_activitat
      ) cnt ON a.id_activitat = cnt.id_activitat
      WHERE     a.any_escolar = ?
      ORDER BY  FIELD(a.dia_semana,'Dilluns','Dimarts','Dimecres','Dijous','Divendres'),
                a.hora_inici
    `;
    const [rows] = await pool.execute(sql, [any]);
    return rows;
  },

  /**
   * Retorna els IDs de les activitats en què un alumne ja està inscrit,
   * filtrades per l'any escolar actual.
   * Usat per marcar el botó com a "Ja inscrit" al frontend.
   *
   * @param {number} id_alumne
   * @param {string} any_escolar
   */
  async llistarPerAlumne(id_alumne, any_escolar) {
    const any = any_escolar || obtenirAnyEscolar();
    const sql = `
      SELECT a.id_activitat
      FROM   ACTIVITAT_EXTRAESCOLAR  a
      JOIN   INSCRIPCIO_ACTIVITAT    i ON a.id_activitat = i.id_activitat
      WHERE  i.id_alumne   = ?
        AND  a.any_escolar = ?
    `;
    const [rows] = await pool.execute(sql, [id_alumne, any]);
    return rows.map(r => r.id_activitat);
  },

  /**
   * Retorna les activitats inscrites d'un alumne amb tots els detalls,
   * filtrades per l'any escolar actual.
   * Usat per pintar les activitats al calendari setmanal.
   *
   * @param {number} id_alumne
   * @param {string} any_escolar
   */
  async llistarActivitatsCalendariAlumne(id_alumne, any_escolar) {
    const any = any_escolar || obtenirAnyEscolar();
    const sql = `
      SELECT
        a.id_activitat,
        a.nom,
        a.dia_semana,
        a.hora_inici,
        a.hora_fi,
        a.responsable,
        au.nom_aula
      FROM   ACTIVITAT_EXTRAESCOLAR  a
      JOIN   INSCRIPCIO_ACTIVITAT    i  ON a.id_activitat = i.id_activitat
      LEFT JOIN AULA                 au ON a.id_aula      = au.id_aula
      WHERE  i.id_alumne   = ?
        AND  a.any_escolar = ?
      ORDER BY a.hora_inici
    `;
    const [rows] = await pool.execute(sql, [id_alumne, any]);
    return rows;
  },

  /**
   * Flux d'inscripció del diagrama de flux del TFG.
   * Executa la validació de places i la inserció en una transacció
   * per evitar condicions de carrera (race conditions) si dos alumnes
   * intenten la darrera plaça simultàniament.
   *
   * No necessita any_escolar perquè id_activitat ja identifica
   * unívocament una activitat d'un any concret.
   *
   * @param {number} id_alumne
   * @param {number} id_activitat
   * @returns {{ ok: boolean, motiu?: string, id_inscripcio?: number }}
   */
  async inscriureAlumne(id_alumne, id_activitat) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // ── Pas 1: Bloquejar la fila de l'activitat per a lectura consistent ──
      //    FOR UPDATE evita que dos usuaris llegeixin alhora "1 plaça lliure"
      //    i els dos s'inscriguin superant el límit (race condition).
      const [[activitat]] = await conn.execute(`
        SELECT nom, places_maximes, any_escolar, dia_semana, hora_inici, hora_fi
        FROM   ACTIVITAT_EXTRAESCOLAR
        WHERE  id_activitat = ?
        FOR UPDATE
      `, [id_activitat]);

      if (!activitat) {
        await conn.rollback();
        return { ok: false, motiu: 'Activitat no trobada.' };
      }

      // ── Pas 1b: Rebutjar inscripcions en cursos ja finalitzats ────────────
      // Comparem lexicogràficament: '2024/2025' < '2025/2026' → cert
      const anyActual = obtenirAnyEscolar();
      if (activitat.any_escolar < anyActual) {
        await conn.rollback();
        return { ok: false, motiu: 'CURS_PASSAT' };
      }

      // ── Pas 2: Comprovar si l'alumne ja estava inscrit ────────────────────
      const [[jaExisteix]] = await conn.execute(`
        SELECT id_inscripcio
        FROM   INSCRIPCIO_ACTIVITAT
        WHERE  id_alumne    = ?
          AND  id_activitat = ?
      `, [id_alumne, id_activitat]);

      if (jaExisteix) {
        await conn.rollback();
        return { ok: false, motiu: 'Ja estàs inscrit a aquesta activitat.' };
      }

      // ── Pas 3: Comptar inscripcions actuals ───────────────────────────────
      const [[{ total }]] = await conn.execute(`
        SELECT COUNT(*) AS total
        FROM   INSCRIPCIO_ACTIVITAT
        WHERE  id_activitat = ?
      `, [id_activitat]);

      // ── Pas 3.5: Comprovar solapament horari amb altres activitats ────────
      //    Mateixa regla matemàtica que HORARI_LECTIU:
      //      hora_inici_EXISTENT < hora_fi_NOVA  AND  hora_fi_EXISTENT > hora_inici_NOVA
      //    Si l'activitat no té dia/hora fixos (dia_semana NULL), no pot
      //    solapar-se amb cap altra i ometem la comprovació.
      if (activitat.dia_semana) {
        const [[conflicte]] = await conn.execute(`
          SELECT ae.nom, ae.dia_semana, ae.hora_inici, ae.hora_fi
          FROM   INSCRIPCIO_ACTIVITAT   ia
          JOIN   ACTIVITAT_EXTRAESCOLAR ae ON ia.id_activitat = ae.id_activitat
          WHERE  ia.id_alumne   = ?
            AND  ae.any_escolar = ?
            AND  ae.dia_semana  = ?
            AND  ae.hora_inici  < ?
            AND  ae.hora_fi     > ?
          LIMIT 1
        `, [id_alumne, activitat.any_escolar, activitat.dia_semana, activitat.hora_fi, activitat.hora_inici]);

        if (conflicte) {
          await conn.rollback();
          return {
            ok: false,
            motiu: 'SOLAPAMENT_HORARI',
            detall: `Ja estàs inscrit a "${conflicte.nom}" (${conflicte.dia_semana} ` +
                    `${fmtHora(conflicte.hora_inici)}–${fmtHora(conflicte.hora_fi)}), ` +
                    `que es solapa amb "${activitat.nom}" ` +
                    `(${fmtHora(activitat.hora_inici)}–${fmtHora(activitat.hora_fi)}).`,
          };
        }
      }

      // ── Pas 4: Validar places disponibles ────────────────────────────────
      if (total >= activitat.places_maximes) {
        await conn.rollback();
        return { ok: false, motiu: 'ACTIVITAT_COMPLETA' };
      }

      // ── Pas 5: Inserir la inscripció ──────────────────────────────────────
      const [result] = await conn.execute(`
        INSERT INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
        VALUES (?, ?)
      `, [id_alumne, id_activitat]);

      await conn.commit();
      return { ok: true, id_inscripcio: result.insertId };

    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * Cancel·la la inscripció d'un alumne a una activitat extraescolar.
   * Esborra la fila d'INSCRIPCIO_ACTIVITAT i allibera la plaça a l'instant
   * (la plaça lliure es recalcula en temps real a llistarTotes()).
   *
   * @param {number} id_alumne
   * @param {number} id_activitat
   * @returns {{ ok: boolean, motiu?: string }}
   */
  async desinscriureAlumne(id_alumne, id_activitat) {
    const [result] = await pool.execute(`
      DELETE FROM INSCRIPCIO_ACTIVITAT
      WHERE id_alumne    = ?
        AND id_activitat = ?
    `, [id_alumne, id_activitat]);

    if (result.affectedRows === 0) {
      return { ok: false, motiu: 'NO_INSCRIT' };
    }
    return { ok: true };
  },

  /**
   * Obté l'id_alumne a partir de l'id_usuari.
   * Necessari perquè el JWT conté id_usuari, però INSCRIPCIO usa id_alumne.
   *
   * Si ALUMNE té any_escolar, filtra pel curs actual i fa fallback
   * si la columna no existeix o no hi ha dada per l'any actual.
   *
   * @param {number} id_usuari
   * @returns {Promise<number|null>}
   */
  /**
   * Obté l'id_alumne a partir de l'id_usuari per a un any escolar concret.
   * El JWT conté id_usuari, però INSCRIPCIO_ACTIVITAT usa id_alumne.
   * Com que un alumne té una fila a ALUMNE per any, cal filtrar per any.
   *
   * IMPORTANT: si no es passa any_escolar, pot retornar l'id_alumne d'un
   * any diferent al que es vol consultar, fent que `llistarPerAlumne`
   * marqui com a inscrites activitats d'un any equivocat.
   *
   * @param {number} id_usuari
   * @param {string} [any_escolar]  Si s'omiteix, usa el curs actual del servidor
   */
  async obtenirIdAlumne(id_usuari, any_escolar) {
    const any = any_escolar || obtenirAnyEscolar();

    // Intent 1: filtrar per any_escolar (el any que ha demanat el client)
    const [[rowAny]] = await pool.execute(`
      SELECT id_alumne
      FROM   ALUMNE
      WHERE  id_usuari   = ?
        AND  any_escolar = ?
      LIMIT  1
    `, [id_usuari, any]);

    if (rowAny) return rowAny.id_alumne;

    // Fallback: sense filtre d'any (BD sense Bloc 4 de la migració)
    const [[row]] = await pool.execute(`
      SELECT id_alumne
      FROM   ALUMNE
      WHERE  id_usuari = ?
      ORDER  BY any_escolar DESC
      LIMIT  1
    `, [id_usuari]);

    return row ? row.id_alumne : null;
  },

};

module.exports = Activitat;
