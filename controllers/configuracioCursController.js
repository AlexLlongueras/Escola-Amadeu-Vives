'use strict';

const ConfiguracioCurs          = require('../models/ConfiguracioCurs');
const { carregarAnyEscolarActiu, validarAnyEscolar } = require('../utils/anyEscolar');

module.exports = {

  async llistar(_req, res) {
    const cursos = await ConfiguracioCurs.llistar();
    res.json({ cursos });
  },

  async crear(req, res) {
    const { any_escolar, data_inici, data_fi } = req.body;

    if (!any_escolar || !validarAnyEscolar(any_escolar)) {
      return res.status(400).json({ error: 'any_escolar incorrecte. Format AAAA/AAAA (ex: 2026/2027).' });
    }
    if (!data_inici || !data_fi) {
      return res.status(400).json({ error: 'data_inici i data_fi son obligatoris.' });
    }
    if (data_fi <= data_inici) {
      return res.status(400).json({ error: 'data_fi ha de ser posterior a data_inici.' });
    }

    try {
      const id = await ConfiguracioCurs.crear({ any_escolar, data_inici, data_fi });
      res.status(201).json({ id_curs: id, any_escolar });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: `Ja existeix un curs "${any_escolar}".` });
      }
      throw e;
    }
  },

  async activar(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID no valid.' });

    const n = await ConfiguracioCurs.activar(id);
    if (!n) return res.status(404).json({ error: 'Curs no trobat.' });

    const nouAny = await carregarAnyEscolarActiu();
    res.json({ missatge: 'Curs activat.', any_escolar_actiu: nouAny });
  },

  async actualitzarDates(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID no valid.' });

    const { data_inici, data_fi } = req.body;
    if (!data_inici || !data_fi) {
      return res.status(400).json({ error: 'data_inici i data_fi son obligatoris.' });
    }
    if (data_fi <= data_inici) {
      return res.status(400).json({ error: 'data_fi ha de ser posterior a data_inici.' });
    }

    const n = await ConfiguracioCurs.actualitzarDates(id, { data_inici, data_fi });
    if (!n) return res.status(404).json({ error: 'Curs no trobat.' });
    res.json({ missatge: 'Dates actualitzades.' });
  },

  async eliminar(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID no valid.' });

    const n = await ConfiguracioCurs.eliminar(id);
    if (!n) return res.status(409).json({ error: 'No es pot eliminar el curs actiu o no existeix.' });
    res.json({ missatge: 'Curs eliminat.' });
  },
};
