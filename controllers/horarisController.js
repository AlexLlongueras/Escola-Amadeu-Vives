'use strict';

const Horari = require('../models/Horari');
const { getAnyEscolarActiu, validarAnyEscolar } = require('../utils/anyEscolar');

const DIES_VALIDS = new Set(['Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres']);

const ROLS_VALIDS = new Set([
  'Titular','Suport','Acollida','Coeducació',
  'SIEI','SIEI+','EE','Auxiliar EE','Vetlladora',
  'TIS','Logopeda','Fisioterapeuta',
]);

// Rols permesos per als professors de suport (llista tancada de 10 valors)
const ROLS_SUPORT_VALIDS = new Set([
  'Suport','Acollida','SIEI','SIEI+','EE',
  'Auxiliar EE','Vetlladora','TIS','Logopeda','Fisioterapeuta',
]);

function resoldrAny(req) {
  const c = req.query.any_escolar || req.body?.any_escolar;
  return (c && validarAnyEscolar(c)) ? c : getAnyEscolarActiu();
}

const horarisController = {

  // GET /api/horaris/professor/:id[?any_escolar=…]
  async getByProfessor(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID de professor no vàlid.' });
    const any     = resoldrAny(req);
    const horaris = await Horari.getByProfessor(id, any);
    res.json({ id_professor: id, any_escolar: any, horaris });
  },

  // GET /api/horaris?grup=1r A[&any_escolar=…]
  async getByGrup(req, res) {
    const grup = req.query.grup;
    if (!grup) return res.status(400).json({ error: 'El parametre ?grup es obligatori.' });
    const any     = resoldrAny(req);
    const horaris = await Horari.getByGrup(grup, any);
    res.json({ grup, any_escolar: any, horaris });
  },

  // POST /api/horaris
  async create(req, res) {
    try {
    console.log('[POST /api/horaris] DADES REBUDES:', JSON.stringify(req.body, null, 2));
    const { dia_semana, hora_inici, hora_fi, id_asignatura, id_aula, id_professor } = req.body;
    const professors_suport = Array.isArray(req.body.professors_suport) ? req.body.professors_suport : [];

    let grups = req.body.grups || [];
    if (!Array.isArray(grups)) grups = [grups];
    if (!grups.length && req.body.grup) grups = [req.body.grup];

    const any = resoldrAny(req);

    // Camps obligatoris
    const absents = [];
    if (!dia_semana)    absents.push('dia_semana');
    if (!hora_inici)    absents.push('hora_inici');
    if (!hora_fi)       absents.push('hora_fi');
    if (!id_asignatura) absents.push('id_asignatura');
    if (!id_aula)       absents.push('id_aula (Aula és obligatòria)');
    if (!id_professor)  absents.push('id_professor (Professor Titular obligatori)');
    if (!grups.length)  absents.push('grup');
    if (absents.length) return res.status(400).json({ error: `Falten camps: ${absents.join(', ')}.` });

    if (!DIES_VALIDS.has(dia_semana)) {
      return res.status(400).json({ error: `Dia "${dia_semana}" no valid. Ha de ser Dilluns-Divendres.` });
    }

    const hiNet = String(hora_inici).substring(0, 5);
    const hfNet = String(hora_fi).substring(0, 5);
    if (!Horari.RE_HORA.test(hiNet)) {
      return res.status(400).json({ error: `hora_inici "${hora_inici}" no valid. Format HH:MM.` });
    }
    if (!Horari.RE_HORA.test(hfNet)) {
      return res.status(400).json({ error: `hora_fi "${hora_fi}" no valid. Format HH:MM.` });
    }
    if (hfNet <= hiNet) {
      return res.status(400).json({ error: `hora_fi (${hfNet}) ha de ser posterior a hora_inici (${hiNet}).` });
    }

    // Titular sempre primer; suports amb el seu rol i aula específica
    // Els IDs ja vistos s'eliminen per evitar violació de UQ_HP (id_horari, id_professor)
    const _idsUsats = new Set([Number(id_professor)]);
    const profsNorm = [
      { id_professor: Number(id_professor), rol: 'Titular', id_substitut: null, id_aula: null },
    ];
    for (const ps of professors_suport) {
      const pid = Number(ps.id_professor);
      if (!pid || _idsUsats.has(pid)) continue;
      _idsUsats.add(pid);
      profsNorm.push({
        id_professor: pid,
        rol:          ROLS_SUPORT_VALIDS.has(ps.rol) ? ps.rol : 'Suport',
        id_substitut: null,
        id_aula:      ps.id_aula ? Number(ps.id_aula) : null,
      });
    }

    const aulaId = Number(id_aula);

    // Comprova solapaments d'aula i professors (una sola vegada, independentment dels grups)
    const conflictes = await Horari.comprovarSolapament({
      dia_semana,
      hora_inici:  hiNet + ':00',
      hora_fi:     hfNet + ':00',
      id_aula:     aulaId,
      professors:  profsNorm,
      any_escolar: any,
    });

    if (conflictes.length) {
      return res.status(409).json({
        error: `No es pot crear la franja: ${conflictes.length} solapament(s).`,
        conflictes,
      });
    }

    // Inserir una franja per cada grup seleccionat
    const ids = [];
    for (const grup of grups) {
      const id = await Horari.crear({
        dia_semana,
        hora_inici:    hiNet + ':00',
        hora_fi:       hfNet + ':00',
        id_asignatura: Number(id_asignatura),
        id_aula:       aulaId,
        grup,
        any_escolar:   any,
        professors:    profsNorm,
      });
      ids.push(id);
    }

    res.status(201).json({
      missatge: `${ids.length} franja${ids.length !== 1 ? 'es' : ''} creada${ids.length !== 1 ? 'es' : ''}.`,
      ids,
      any_escolar: any,
    });
    } catch (err) {
      console.error('[POST /api/horaris]', err);
      res.status(500).json({ error: `Error intern: ${err.message || String(err)}` });
    }
  },

  // PUT /api/horaris/:id
  async actualitzar(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID no vàlid.' });

      console.log(`[PUT /api/horaris/${id}] DADES REBUDES:`, JSON.stringify(req.body, null, 2));

      const { dia_semana, hora_inici, hora_fi, id_asignatura, id_aula, id_professor } = req.body;
      const professors_suport = Array.isArray(req.body.professors_suport) ? req.body.professors_suport : [];

      let grups = req.body.grups || [];
      if (!Array.isArray(grups)) grups = [grups];
      if (!grups.length && req.body.grup) grups = [req.body.grup];
      grups = grups.filter(Boolean);

      const absents = [];
      if (!dia_semana)    absents.push('dia_semana');
      if (!hora_inici)    absents.push('hora_inici');
      if (!hora_fi)       absents.push('hora_fi');
      if (!id_asignatura) absents.push('id_asignatura');
      if (!id_professor)  absents.push('id_professor (Professor Titular obligatori)');
      if (absents.length) return res.status(400).json({ error: `Falten camps: ${absents.join(', ')}.` });

      if (!DIES_VALIDS.has(dia_semana)) {
        return res.status(400).json({ error: `Dia "${dia_semana}" no vàlid.` });
      }

      const hiNet = String(hora_inici).substring(0, 5);
      const hfNet = String(hora_fi).substring(0, 5);
      if (!Horari.RE_HORA.test(hiNet) || !Horari.RE_HORA.test(hfNet)) {
        return res.status(400).json({ error: "Format d'hora incorrecte. Usa HH:MM." });
      }
      if (hfNet <= hiNet) {
        return res.status(400).json({ error: `hora_fi (${hfNet}) ha de ser posterior a hora_inici (${hiNet}).` });
      }

      // Titular sempre primer; suports amb el seu rol i aula específica
      // _idsUsats evita duplicats (id_horari, id_professor) que violarien UQ_HP
      const _idsUsats = new Set([Number(id_professor)]);
      const profsNorm = [
        { id_professor: Number(id_professor), rol: 'Titular', id_substitut: null, id_aula: null },
      ];
      for (const ps of professors_suport) {
        const pid = Number(ps.id_professor);
        if (!pid || _idsUsats.has(pid)) continue;
        _idsUsats.add(pid);
        profsNorm.push({
          id_professor: pid,
          rol:          ROLS_SUPORT_VALIDS.has(ps.rol) ? ps.rol : 'Suport',
          id_substitut: null,
          id_aula:      ps.id_aula ? Number(ps.id_aula) : null,
        });
      }

      const n = await Horari.actualitzar(id, {
        dia_semana,
        hora_inici:    hiNet + ':00',
        hora_fi:       hfNet + ':00',
        id_asignatura: Number(id_asignatura),
        id_aula:       id_aula ? Number(id_aula) : null,
        grups,
        professors:    profsNorm,
      });

      if (!n) return res.status(404).json({ error: 'Franja no trobada.' });
      res.json({ missatge: 'Franja actualitzada correctament.', id_horari: id, n_grups: n });
    } catch (err) {
      console.error('[PUT /api/horaris/:id]', err);
      res.status(500).json({ error: `Error intern: ${err.message || String(err)}` });
    }
  },

  // POST /api/horaris/:id/professors
  async afegirProfessor(req, res) {
    const id_horari = parseInt(req.params.id, 10);
    const { id_professor, rol, id_substitut } = req.body;
    if (!id_horari || !id_professor) {
      return res.status(400).json({ error: 'id_horari i id_professor son obligatoris.' });
    }
    const rolFinal = ROLS_VALIDS.has(rol) ? rol : 'Titular';
    await Horari.afegirProfessor(id_horari, Number(id_professor), rolFinal, id_substitut || null);
    res.status(201).json({ missatge: 'Professor afegit a la franja.' });
  },

  // DELETE /api/horaris/:id/professors/:id_prof
  async eliminarProfessor(req, res) {
    const id_horari    = parseInt(req.params.id,      10);
    const id_professor = parseInt(req.params.id_prof, 10);
    if (!id_horari || !id_professor) {
      return res.status(400).json({ error: 'IDs no valids.' });
    }
    const n = await Horari.eliminarProfessorDeHorari(id_horari, id_professor);
    if (!n) return res.status(404).json({ error: 'Assignació no trobada.' });
    res.json({ missatge: 'Professor eliminat de la franja.' });
  },

  // PUT /api/horaris/:id/professors/:id_prof/substitut
  async actualitzarSubstitut(req, res) {
    const id_horari    = parseInt(req.params.id,      10);
    const id_professor = parseInt(req.params.id_prof, 10);
    const { id_substitut } = req.body;
    if (!id_horari || !id_professor) {
      return res.status(400).json({ error: 'IDs no valids.' });
    }
    const n = await Horari.actualitzarSubstitut(id_horari, id_professor, id_substitut || null);
    if (!n) return res.status(404).json({ error: 'Assignació no trobada.' });
    res.json({ missatge: 'Substitut actualitzat.' });
  },
};

module.exports = horarisController;
