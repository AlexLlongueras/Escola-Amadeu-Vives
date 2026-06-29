// controllers/activitatsController.js
// Gestiona les peticions HTTP per a activitats extraescolars i inscripcions.
//
// CANVI v3: accepta ?any_escolar= com a paràmetre opcional a tots els endpoints
// de consulta. Si no ve, calcula automàticament el curs actual per data.

'use strict';

const Activitat             = require('../models/Activitat');
const { obtenirAnyEscolar, validarAnyEscolar } = require('../utils/anyEscolar');

// ─── Helper intern: extreu i valida any_escolar de la query ──────────────────
function resoldrAnyEscolar(req) {
  const candidat = req.query.any_escolar;
  if (candidat) {
    if (!validarAnyEscolar(candidat)) return null; // el controller retornarà 400
    return candidat;
  }
  return obtenirAnyEscolar(); // curs actual per la data del servidor
}

const activitatsController = {

  /**
   * GET /api/activitats[?any_escolar=2025/2026]
   *
   * Accessible per a tots els rols autenticats.
   * Retorna la llista d'activitats de l'any escolar demanat (o el curs actual).
   * Si l'usuari és alumne/família, marca quines ja té inscrites.
   */
  async llistar(req, res) {
    try {
      // Validació explícita del format si ve per query
      if (req.query.any_escolar && !validarAnyEscolar(req.query.any_escolar)) {
        return res.status(400).json({
          error: 'Format d\'any_escolar incorrecte. Usa el format AAAA/AAAA (ex: 2025/2026).',
        });
      }

      const any_escolar = resoldrAnyEscolar(req);
      const activitats  = await Activitat.llistarTotes(any_escolar);

      // Per a alumnes/família: afegim la info de si ja estan inscrits.
      // IMPORTANT: passem any_escolar perquè cada any l'alumne té un id_alumne
      // diferent a ALUMNE (una fila per curs). Sense l'any, podríem marcar
      // com a inscrit basant-nos en les inscripcions d'un curs diferent.
      let inscritesIds = [];
      if (req.usuari.rol === 'alumne' || req.usuari.rol === 'familia') {
        const id_alumne = await Activitat.obtenirIdAlumne(req.usuari.id, any_escolar);
        if (id_alumne) {
          inscritesIds = await Activitat.llistarPerAlumne(id_alumne, any_escolar);
        }
      }

      // Afegim el camp 'ja_inscrit' i normalitzem els valors numèrics
      const resultat = activitats.map(a => ({
        ...a,
        ja_inscrit:      inscritesIds.includes(a.id_activitat),
        places_lliures:  Number(a.places_lliures),
        places_ocupades: Number(a.places_ocupades),
      }));

      return res.status(200).json({ any_escolar, activitats: resultat });

    } catch (err) {
      console.error('Error a llistar activitats:', err.message);
      return res.status(500).json({ error: 'Error intern del servidor.' });
    }
  },

  /**
   * POST /api/activitats/:id/inscriure
   *
   * Accessible per: alumne (no família).
   * Segueix el flux del diagrama: valida places → inscriu → retorna resultat.
   * L'any_escolar és implícit a l'activitat (identificada per id_activitat).
   */
  async inscriure(req, res) {
    try {
      if (req.usuari.rol === 'familia') {
        return res.status(403).json({
          error: 'Les famílies no poden inscriure directament. ' +
                 'L\'alumne ha d\'accedir amb el seu compte.',
        });
      }

      const id_activitat = parseInt(req.params.id, 10);
      if (isNaN(id_activitat)) {
        return res.status(400).json({ error: 'ID d\'activitat no vàlid.' });
      }

      const id_alumne = await Activitat.obtenirIdAlumne(req.usuari.id);
      if (!id_alumne) {
        return res.status(403).json({
          error: 'El teu perfil no té un alumne associat. ' +
                 'Contacta amb l\'administrador.',
        });
      }

      const resultat = await Activitat.inscriureAlumne(id_alumne, id_activitat);

      if (!resultat.ok) {
        if (resultat.motiu === 'ACTIVITAT_COMPLETA') {
          return res.status(409).json({ error: 'Activitat completa. No queden places disponibles.' });
        }
        if (resultat.motiu === 'CURS_PASSAT') {
          return res.status(400).json({ error: 'Operació no permesa: no es pot inscriure a un curs escolar ja finalitzat.' });
        }
        if (resultat.motiu === 'SOLAPAMENT_HORARI') {
          return res.status(409).json({
            error:  'Ja estàs inscrit en una altra activitat a la mateixa hora.',
            codi:   'SOLAPAMENT_HORARI',
            detall: resultat.detall,
          });
        }
        return res.status(400).json({ error: resultat.motiu });
      }

      return res.status(201).json({
        missatge:       'Inscripció realitzada correctament.',
        id_inscripcio:  resultat.id_inscripcio,
      });

    } catch (err) {
      console.error('Error a inscriure:', err.message);
      return res.status(500).json({ error: 'Error intern del servidor.' });
    }
  },

  /**
   * DELETE /api/activitats/:id/desinscriure
   *
   * Accessible per: alumne (no família, igual que inscriure).
   * Esborra la inscripció de l'alumne logueat i allibera la plaça
   * immediatament perquè el càlcul de places_lliures és en temps real.
   */
  async desinscriure(req, res) {
    try {
      if (req.usuari.rol === 'familia') {
        return res.status(403).json({
          error: 'Les famílies no poden gestionar inscripcions directament. ' +
                 'L\'alumne ha d\'accedir amb el seu compte.',
        });
      }

      const id_activitat = parseInt(req.params.id, 10);
      if (isNaN(id_activitat)) {
        return res.status(400).json({ error: 'ID d\'activitat no vàlid.' });
      }

      const id_alumne = await Activitat.obtenirIdAlumne(req.usuari.id);
      if (!id_alumne) {
        return res.status(403).json({
          error: 'El teu perfil no té un alumne associat. ' +
                 'Contacta amb l\'administrador.',
        });
      }

      const resultat = await Activitat.desinscriureAlumne(id_alumne, id_activitat);

      if (!resultat.ok) {
        return res.status(404).json({ error: 'No estaves inscrit a aquesta activitat.' });
      }

      return res.status(200).json({ missatge: 'Inscripció cancel·lada correctament.' });

    } catch (err) {
      console.error('Error a desinscriure:', err.message);
      return res.status(500).json({ error: 'Error intern del servidor.' });
    }
  },

  /**
   * GET /api/activitats/calendari[?any_escolar=2025/2026]
   *
   * Retorna les activitats inscrites de l'alumne per a l'any escolar demanat,
   * per pintar-les al calendari setmanal.
   */
  async calendariAlumne(req, res) {
    try {
      if (req.query.any_escolar && !validarAnyEscolar(req.query.any_escolar)) {
        return res.status(400).json({
          error: 'Format d\'any_escolar incorrecte. Usa el format AAAA/AAAA (ex: 2025/2026).',
        });
      }

      const any_escolar = resoldrAnyEscolar(req);
      // Passem any_escolar perquè l'alumne pot tenir id_alumne diferent per any
      const id_alumne   = await Activitat.obtenirIdAlumne(req.usuari.id, any_escolar);

      if (!id_alumne) {
        return res.status(200).json({ any_escolar, activitats: [] });
      }

      const activitats = await Activitat.llistarActivitatsCalendariAlumne(id_alumne, any_escolar);
      return res.status(200).json({ any_escolar, activitats });

    } catch (err) {
      console.error('Error a calendariAlumne:', err.message);
      return res.status(500).json({ error: 'Error intern del servidor.' });
    }
  },

};

module.exports = activitatsController;
