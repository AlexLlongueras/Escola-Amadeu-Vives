// controllers/authController.js
// Gestiona el flux de Login/Autenticació definit al diagrama de casos d'ús.
// Flux: rebre credencials → buscar usuari → comparar hash → emetre JWT

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const authController = {

  /**
   * POST /api/auth/login
   * Body esperat: { email: string, password: string }
   *
   * Respostes:
   *   200 → { token, usuari: { id, nom, email, rol } }
   *   400 → Falten camps obligatoris
   *   401 → Credencials incorrectes (missatge genèric per seguretat)
   *   500 → Error intern
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // ── 1. Validació bàsica d'entrada ───────────────────────────────────
      if (!email || !password) {
        return res.status(400).json({
          error: 'Els camps email i password són obligatoris.',
        });
      }

      // ── 2. Buscar l'usuari per email (via model) ─────────────────────────
      const usuari = await Usuario.findByEmail(email);

      // Missatge genèric: no revelem si el problema és l'email o la password
      if (!usuari) {
        return res.status(401).json({
          error: 'Credencials incorrectes.',
        });
      }

      // ── 3. Comparar la password amb el hash emmagatzemat a la BD ─────────
      const passwordCorrecta = await bcrypt.compare(password, usuari.password);

      if (!passwordCorrecta) {
        return res.status(401).json({
          error: 'Credencials incorrectes.',
        });
      }

      // ── 4. Generar el token JWT amb el rol inclòs al payload ─────────────
      // El rol és clau per al middleware de protecció de rutes per perfil
      const payload = {
        id:  usuari.id_usuari,
        rol: usuari.rol,         // 'admin' | 'profesor' | 'alumne' | 'familia'
      };

      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      // ── 5. Respondre amb el token i les dades públiques de l'usuari ───────
      // Mai retornem el camp 'password' (ni el hash) en la resposta
      return res.status(200).json({
        token,
        usuari: {
          id:    usuari.id_usuari,
          nom:   usuari.nom_usuari,
          email: usuari.email,
          rol:   usuari.rol,
        },
      });

    } catch (err) {
      console.error('Error al login:', err.message);
      return res.status(500).json({ error: 'Error intern del servidor.' });
    }
  },

};

module.exports = authController;