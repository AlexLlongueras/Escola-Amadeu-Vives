// middleware/errorHandler.js
// Captura TOTS els errors no controlats de l'aplicació Express.
// Amb 'express-async-errors' instal·lat, els errors de funcions async
// també arriben aquí automàticament sense necessitat de try/catch manual.

// Codis d'error de MySQL que volem tractar de forma específica
const MYSQL_ERRORS = {
  'ER_ROW_IS_REFERENCED_2': {
    status:  409,
    missatge: 'No es pot eliminar: aquest registre té dades associades que en depenen.',
  },
  'ER_NO_REFERENCED_ROW_2': {
    status:  400,
    missatge: 'Un dels IDs introduïts no existeix a la base de dades.',
  },
  'ER_DUP_ENTRY': {
    status:  409,
    missatge: 'Ja existeix un registre amb aquestes dades.',
  },
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // ── Error de MySQL conegut ──────────────────────────────────────────────
  if (err.code && MYSQL_ERRORS[err.code]) {
    const { status, missatge } = MYSQL_ERRORS[err.code];
    return res.status(status).json({ error: missatge });
  }

  // ── Error de JWT (token mal format, expirat, etc.) ──────────────────────
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token invàlid o expirat.' });
  }

  // ── Error de validació personalitzat ────────────────────────────────────
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  // ── Error intern no previst: log complet però resposta genèrica ─────────
  console.error('💥 ERROR NO CONTROLAT:');
  console.error(`   Ruta:    ${req.method} ${req.originalUrl}`);
  console.error(`   Missatge: ${err.message}`);
  console.error(`   Stack:   ${err.stack}`);

  return res.status(500).json({
    error:   'Error intern del servidor. Contacta amb l\'administrador.',
    // Només mostrem el detall en desenvolupament
    detall:  process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

module.exports = errorHandler;