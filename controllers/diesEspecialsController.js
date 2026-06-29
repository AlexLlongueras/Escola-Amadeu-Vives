// controllers/diesEspecialsController.js
// Gestió dels dies especials (festius, excursions, colònies).
//
// Endpoints:
//   GET  /api/dies-especials             → tots els rols autenticats
//   POST /api/dies-especials             → exclusiu admin
//   DELETE /api/dies-especials/:id       → exclusiu admin

'use strict';

const DiaEspecial = require('../models/DiaEspecial');
const { obtenirAnyEscolar, validarAnyEscolar } = require('../utils/anyEscolar');

const TIPUS_VALIDS = ['festiu', 'excursio', 'colonies'];

const diesEspecialsController = {

  /**
   * GET /api/dies-especials[?any_escolar=2025/2026][&grup=1r A]
   *
   * Retorna tots els dies especials per al curs indicat.
   * Si es passa ?grup, filtra per events del centre + events del grup concret.
   * Si no s'indica any_escolar, fa servir el curs actual.
   */
  async llistar(req, res) {
    let any_escolar = obtenirAnyEscolar();
    if (req.query.any_escolar) {
      if (!validarAnyEscolar(req.query.any_escolar)) {
        return res.status(400).json({
          error: 'Format d\'any_escolar incorrecte. Usa el format AAAA/AAAA (ex: 2025/2026).',
        });
      }
      any_escolar = req.query.any_escolar;
    }

    // ?grups=1r A,2n B  → array (professor multi-grup)
    // ?grup=1r A        → string (un sol grup: alumne, família, admin)
    // (cap paràmetre)   → null   → tots els events (taula admin)
    let grupFiltrat = null;
    if (req.query.grups) {
      grupFiltrat = req.query.grups
        .split(',')
        .map(g => g.trim())
        .filter(Boolean);   // array de strings
    } else if (req.query.grup) {
      grupFiltrat = req.query.grup;   // string
    }

    const dies = await DiaEspecial.llistar(any_escolar, grupFiltrat);
    return res.json({ any_escolar, dies_especials: dies });
  },

  /**
   * POST /api/dies-especials
   * Body: { nom_esdeveniment, tipus, data_inici, data_fi, grup? }
   *
   * L'any_escolar es calcula automàticament a partir de data_inici.
   * No cal que el client l'enviï explícitament.
   *
   * Validacions:
   *   1. Camps obligatoris presents
   *   2. Tipus vàlid (festiu | excursio | colonies)
   *   3. data_fi >= data_inici
   */
  async crear(req, res) {
    const { nom_esdeveniment, tipus, data_inici, data_fi, grup } = req.body;

    // ── 1. Camps obligatoris ──────────────────────────────────────────────────
    if (!nom_esdeveniment || !tipus || !data_inici || !data_fi) {
      return res.status(400).json({
        error: 'Falten camps obligatoris: nom_esdeveniment, tipus, data_inici, data_fi.',
      });
    }

    // ── 2. Tipus vàlid ────────────────────────────────────────────────────────
    if (!TIPUS_VALIDS.includes(tipus)) {
      return res.status(400).json({
        error:         `Tipus "${tipus}" no vàlid.`,
        tipus_permesos: TIPUS_VALIDS,
      });
    }

    // ── 3. data_fi >= data_inici ──────────────────────────────────────────────
    if (data_fi < data_inici) {
      return res.status(400).json({
        error: `La data de fi (${data_fi}) ha de ser igual o posterior a la data d'inici (${data_inici}).`,
      });
    }

    // ── 4. Càlcul automàtic de l'any escolar a partir de data_inici ──────────
    // Usem la mateixa lògica que el backend per garantir coherència.
    const any_escolar = obtenirAnyEscolar(new Date(data_inici));

    // ── 5. Inserció ───────────────────────────────────────────────────────────
    const nouId = await DiaEspecial.crear({
      nom_esdeveniment,
      tipus,
      data_inici,
      data_fi,
      grup:        grup?.trim() || null,
      any_escolar,
    });

    return res.status(201).json({
      missatge:    'Dia especial creat correctament.',
      id_dia:      nouId,
      any_escolar,
    });
  },

  /**
   * DELETE /api/dies-especials/:id
   * Elimina un dia especial per ID.
   */
  async eliminar(req, res) {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'ID no vàlid.' });
    }

    const afectades = await DiaEspecial.eliminar(id);
    if (afectades === 0) {
      return res.status(404).json({ error: 'Dia especial no trobat.' });
    }

    return res.json({ missatge: `Dia especial (ID: ${id}) eliminat correctament.` });
  },
};

module.exports = diesEspecialsController;
