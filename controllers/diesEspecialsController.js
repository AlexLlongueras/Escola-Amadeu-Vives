'use strict';

const DiaEspecial = require('../models/DiaEspecial');
const { getAnyEscolarActiu, obtenirAnyEscolar, validarAnyEscolar } = require('../utils/anyEscolar');

const TIPUS_VALIDS = ['festiu', 'excursio', 'colonies', 'altre'];

function resoldrAny(req) {
  const c = req.query.any_escolar || req.body?.any_escolar;
  return (c && validarAnyEscolar(c)) ? c : getAnyEscolarActiu();
}

const diesEspecialsController = {

  async llistar(req, res) {
    const any = resoldrAny(req);
    let grupFiltrat = null;
    if (req.query.grups) {
      grupFiltrat = req.query.grups.split(',').map(g => g.trim()).filter(Boolean);
    } else if (req.query.grup) {
      grupFiltrat = req.query.grup;
    }
    const dies = await DiaEspecial.llistar(any, grupFiltrat);
    res.json({ any_escolar: any, dies_especials: dies });
  },

  async crear(req, res) {
    const { nom_esdeveniment, tipus, data_inici, data_fi, grup, any_escolar: anyBody } = req.body;

    if (!nom_esdeveniment || !tipus || !data_inici || !data_fi) {
      return res.status(400).json({ error: 'Falten: nom_esdeveniment, tipus, data_inici, data_fi.' });
    }
    if (!TIPUS_VALIDS.includes(tipus)) {
      return res.status(400).json({ error: `Tipus "${tipus}" no valid.`, tipus_permesos: TIPUS_VALIDS });
    }
    if (data_fi < data_inici) {
      return res.status(400).json({ error: `data_fi (${data_fi}) ha de ser igual o posterior a data_inici.` });
    }

    // Calcula any_escolar: si ve al body usa'l, sinó el calcula per data_inici
    const any_escolar = (anyBody && validarAnyEscolar(anyBody))
      ? anyBody
      : obtenirAnyEscolar(new Date(data_inici));

    const id = await DiaEspecial.crear({
      nom_esdeveniment, tipus, data_inici, data_fi,
      grup: grup?.trim() || null, any_escolar,
    });

    res.status(201).json({ missatge: 'Dia especial creat.', id_dia: id, any_escolar });
  },

  async eliminar(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID no valid.' });
    const n = await DiaEspecial.eliminar(id);
    if (!n) return res.status(404).json({ error: 'Dia especial no trobat.' });
    res.json({ missatge: `Dia especial (ID: ${id}) eliminat.` });
  },
};

module.exports = diesEspecialsController;
