'use strict';

const ClassesTemporal = require('../models/ClassesTemporal');
const { getAnyEscolarActiu, validarAnyEscolar } = require('../utils/anyEscolar');

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function resoldrAny(req) {
  const c = req.query.any_escolar || req.body?.any_escolar;
  return (c && validarAnyEscolar(c)) ? c : getAnyEscolarActiu();
}

module.exports = {

  async getByGrup(req, res) {
    const grup = req.query.grup;
    if (!grup) return res.status(400).json({ error: '?grup es obligatori.' });
    const any     = resoldrAny(req);
    const classes = await ClassesTemporal.getByGrupIAnyEscolar(grup, any);
    res.json({ grup, any_escolar: any, classes });
  },

  async getAll(req, res) {
    const any     = resoldrAny(req);
    const classes = await ClassesTemporal.getByAnyEscolar(any);
    res.json({ any_escolar: any, classes });
  },

  async crear(req, res) {
    const { data, grup, id_asignatura, id_professor, id_aula, hora_inici, hora_fi, nota } = req.body;
    const any = resoldrAny(req);

    if (!data || !RE_DATA.test(data)) return res.status(400).json({ error: 'data incorrecta (YYYY-MM-DD).' });
    if (!grup)          return res.status(400).json({ error: 'grup es obligatori.' });
    if (!id_asignatura) return res.status(400).json({ error: 'id_asignatura es obligatori.' });

    const hiNet = String(hora_inici || '').substring(0, 5);
    const hfNet = String(hora_fi    || '').substring(0, 5);
    if (!RE_HORA.test(hiNet)) return res.status(400).json({ error: `hora_inici "${hora_inici}" no valid. Format HH:MM.` });
    if (!RE_HORA.test(hfNet)) return res.status(400).json({ error: `hora_fi "${hora_fi}" no valid. Format HH:MM.` });
    if (hfNet <= hiNet) return res.status(400).json({ error: 'hora_fi ha de ser posterior a hora_inici.' });

    const id = await ClassesTemporal.crear({
      data, grup,
      id_asignatura: Number(id_asignatura),
      id_professor:  id_professor ? Number(id_professor) : null,
      id_aula:       id_aula      ? Number(id_aula)      : null,
      hora_inici: hiNet + ':00',
      hora_fi:    hfNet + ':00',
      any_escolar: any,
      nota,
    });

    res.status(201).json({ id_classe: id, missatge: 'Classe temporal creada.' });
  },

  async eliminar(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID no valid.' });
    const n = await ClassesTemporal.eliminar(id);
    if (!n) return res.status(404).json({ error: 'Classe temporal no trobada.' });
    res.json({ missatge: 'Classe temporal eliminada.' });
  },
};
