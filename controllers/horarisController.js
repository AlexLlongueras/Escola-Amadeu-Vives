// controllers/horarisController.js
// Filtrat d'horaris personalitzat per rol i any_escolar.
//
// VALIDACIONS IMPLEMENTADES (requeriment tribunal TFG):
//   - any_escolar: format AAAA/AAAA, tots els rols poden canviar de curs
//   - dia_semana:  ha de ser un dels 5 dies lectius en català
//   - hora_fi > hora_inici: error explícit si l'hora final és anterior a l'inicial
//   - IDs (id_asignatura, id_profesor, id_aula): enters positius
//   - Solapaments: A. xoc d'aula, B. xoc de professor, C. xoc de grup
//     → missatges descriptius amb nom d'aula, professor i assignatura

'use strict';

const Horari                = require('../models/Horari');
const { obtenirAnyEscolar, validarAnyEscolar } = require('../utils/anyEscolar');

// ── Valors vàlids per a dia_semana ────────────────────────────────────────────
const DIES_VALIDS = new Set(['Dilluns','Dimarts','Dimecres','Dijous','Divendres']);

// ── Helper: valida que un valor és un enter positiu ───────────────────────────
function esEnterPositiu(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0;
}

const horarisController = {

  /**
   * GET /api/horaris[?grup=1r A][&any_escolar=2025/2026]
   *
   * - Admin:    pot consultar qualsevol grup (?grup obligatori)
   * - Profesor: rep el seu horari personal; pot consultar grups que tutoritza
   * - Alumne:   rep el seu grup automàticament (ignora ?grup)
   * - Familia:  rep la llista de fills; filtra per ?grup o ?id_alumne
   *
   * ?any_escolar és OPCIONAL per a TOTS els rols.
   * Si no ve, s'usa el curs actual calculat automàticament.
   */
  async getByGrup(req, res) {
    try {
      const { rol, id } = req.usuari;

      // ── Determinar l'any escolar (accessible per tots els rols) ─────────────
      let any_escolar = obtenirAnyEscolar();
      if (req.query.any_escolar) {
        if (!validarAnyEscolar(req.query.any_escolar)) {
          return res.status(400).json({
            error: 'Format d\'any_escolar incorrecte. Usa el format AAAA/AAAA (ex: 2025/2026).',
          });
        }
        any_escolar = req.query.any_escolar;
      }

      // ── ADMIN ──────────────────────────────────────────────────────────────
      if (rol === 'admin') {
        const { grup } = req.query;
        if (!grup) {
          return res.status(400).json({
            error: 'Cal el paràmetre ?grup per a la vista d\'administrador.'
          });
        }
        const horaris = await Horari.getByGrup(grup, any_escolar);
        return res.status(200).json({ grup, any_escolar, horaris });
      }

      // ── PROFESSOR ──────────────────────────────────────────────────────────
      if (rol === 'profesor') {
        const [[profe]] = await require('../config/db').execute(
          'SELECT id_profesor FROM PROFESOR WHERE id_usuari = ?', [id]
        );
        if (!profe) {
          return res.status(404).json({ error: 'Perfil de professor no trobat.' });
        }

        const { grup } = req.query;
        if (grup) {
          const { grups_tutoritzats } = await Horari.getByProfesor(profe.id_profesor, any_escolar);
          if (!grups_tutoritzats.includes(grup)) {
            return res.status(403).json({
              error: `No ets tutor del grup "${grup}" per al curs ${any_escolar}.`
            });
          }
          const horaris = await Horari.getByGrup(grup, any_escolar);
          return res.status(200).json({ grup, any_escolar, horaris, grups_tutoritzats });
        }

        const { horaris, grups_tutoritzats } = await Horari.getByProfesor(profe.id_profesor, any_escolar);
        return res.status(200).json({ any_escolar, horaris, grups_tutoritzats });
      }

      // ── ALUMNE ─────────────────────────────────────────────────────────────
      if (rol === 'alumne') {
        // Passem any_escolar per obtenir el grup correcte per a CADA any.
        // Ex: Joan és a '1r A' el 2024/2025 però a '2n A' el 2025/2026.
        const alumne = await Horari.getGrupByIdUsuari(id, any_escolar);
        if (!alumne) {
          return res.status(404).json({ error: 'Perfil d\'alumne no trobat per a aquest curs.' });
        }
        const horaris = await Horari.getByGrup(alumne.grup, any_escolar);
        return res.status(200).json({
          grup:        alumne.grup,
          curs:        alumne.curs,
          any_escolar,
          horaris,
        });
      }

      // ── FAMILIA ────────────────────────────────────────────────────────────
      if (rol === 'familia') {
        if (req.query.grup) {
          const horaris = await Horari.getByGrup(req.query.grup, any_escolar);
          return res.status(200).json({ grup: req.query.grup, any_escolar, horaris });
        }

        const fills = await Horari.getFillsByFamilia(id);
        if (fills.length === 0) {
          return res.status(404).json({
            error: 'No tens cap alumne associat. Contacta amb l\'administrador.'
          });
        }

        const id_alumne = parseInt(req.query.id_alumne);
        const fill      = id_alumne
          ? fills.find(f => f.id_alumne === id_alumne)
          : fills[0];

        if (!fill) {
          return res.status(403).json({
            error: 'Aquest alumne no està associat al teu perfil.'
          });
        }

        const horaris = await Horari.getByGrup(fill.grup, any_escolar);
        return res.status(200).json({
          grup:        fill.grup,
          curs:        fill.curs,
          any_escolar,
          fills,
          fill_actiu:  fill,
          horaris,
        });
      }

    } catch (err) {
      console.error('Error a getByGrup:', err.message);
      return res.status(500).json({ error: 'Error intern del servidor.' });
    }
  },

  /**
   * POST /api/horaris
   * Crea una nova franja horària.
   *
   * VALIDACIONS (per ordre d'execució):
   *   1. Camps obligatoris presents
   *   2. dia_semana ha de ser un dia lectiu vàlid en català
   *   3. IDs han de ser enters positius
   *   4. hora_fi ha de ser estrictament posterior a hora_inici
   *   5. any_escolar ha de tenir el format AAAA/AAAA
   *   6. Cap solapament (A. aula · B. professor · C. grup)
   */
  async create(req, res) {
    try {
      const {
        dia_semana, hora_inici, hora_fi,
        id_asignatura, id_profesor, id_aula, grup,
        any_escolar: anyBody,
      } = req.body;

      // ── 1. Camps obligatoris ───────────────────────────────────────────────
      const campsAbsents = [];
      if (!dia_semana)   campsAbsents.push('dia_semana');
      if (!hora_inici)   campsAbsents.push('hora_inici');
      if (!hora_fi)      campsAbsents.push('hora_fi');
      if (!id_asignatura)campsAbsents.push('id_asignatura');
      if (!id_profesor)  campsAbsents.push('id_profesor');
      if (!id_aula)      campsAbsents.push('id_aula');
      if (!grup)         campsAbsents.push('grup');

      if (campsAbsents.length > 0) {
        return res.status(400).json({
          error:          'Falten camps obligatoris.',
          camps_absents:  campsAbsents,
        });
      }

      // ── 2. Dia de la setmana vàlid ─────────────────────────────────────────
      if (!DIES_VALIDS.has(dia_semana)) {
        return res.status(400).json({
          error:         `Dia "${dia_semana}" no vàlid.`,
          dies_permesos: [...DIES_VALIDS],
        });
      }

      // ── 3. IDs han de ser enters positius ──────────────────────────────────
      const idsInvalids = [];
      if (!esEnterPositiu(id_asignatura)) idsInvalids.push('id_asignatura');
      if (!esEnterPositiu(id_profesor))   idsInvalids.push('id_profesor');
      if (!esEnterPositiu(id_aula))       idsInvalids.push('id_aula');

      if (idsInvalids.length > 0) {
        return res.status(400).json({
          error:       'Els IDs han de ser enters positius.',
          ids_invalids: idsInvalids,
        });
      }

      // ── 4. hora_fi ha de ser posterior a hora_inici ────────────────────────
      // Comparem com a strings 'HH:MM' o 'HH:MM:SS' — funciona en ordre lexicogràfic
      if (hora_fi <= hora_inici) {
        return res.status(400).json({
          error: `L'hora de fi (${hora_fi}) ha de ser posterior a l'hora d'inici (${hora_inici}).`,
        });
      }

      // ── 5. Any escolar ─────────────────────────────────────────────────────
      let any_escolar = obtenirAnyEscolar();
      if (anyBody) {
        if (!validarAnyEscolar(anyBody)) {
          return res.status(400).json({
            error: 'Format d\'any_escolar incorrecte. Usa el format AAAA/AAAA (ex: 2025/2026).',
          });
        }
        any_escolar = anyBody;
      }

      // ── 6. Comprovació de solapaments (A + B + C) ──────────────────────────
      const conflictes = await Horari.comprovarSolapament({
        dia_semana, hora_inici, hora_fi,
        id_aula:     Number(id_aula),
        id_profesor: Number(id_profesor),
        grup,
        any_escolar,
      });

      if (conflictes.length > 0) {
        return res.status(409).json({
          error:      `No es pot crear la franja: ${conflictes.length} solapament${conflictes.length > 1 ? 's' : ''} detectat${conflictes.length > 1 ? 's' : ''}.`,
          any_escolar,
          conflictes,   // array amb missatges descriptius per cada tipus de xoc
        });
      }

      // ── 7. Inserció ────────────────────────────────────────────────────────
      const nouId = await Horari.create({
        dia_semana,
        hora_inici,
        hora_fi,
        id_asignatura: Number(id_asignatura),
        id_profesor:   Number(id_profesor),
        id_aula:       Number(id_aula),
        grup,
        any_escolar,
      });

      return res.status(201).json({
        missatge:    'Franja horària creada correctament.',
        id_horari:   nouId,
        any_escolar,
      });

    } catch (err) {
      console.error('Error a create horari:', err.message);
      return res.status(500).json({ error: 'Error intern del servidor.' });
    }
  },
};

module.exports = horarisController;
