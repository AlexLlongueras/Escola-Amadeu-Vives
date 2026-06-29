// server.js
// Punt d'entrada principal. Configura Express i munta les rutes.

require('dotenv').config();
const express = require('express');

// Importem el pool aquí perquè el test de connexió s'executi en arrencar
require('./config/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globals ───────────────────────────────────────────────────────

// 1) Parseja body JSON i formularis HTML
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2) Serveix fitxers estàtics i força charset=utf-8 a HTML, JS i CSS
//    Sense això, alguns navegadors podrien no detectar l'encoding dels scripts.
app.use(express.static('public', {
  setHeaders (res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  },
}));

// 3) Garanteix charset=utf-8 a TOTES les respostes JSON de l'API.
//    Express ja afegeix charset automàticament, però ho fem explícit per
//    evitar qualsevol proxy o configuració que el pugui ometre.
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(body);
  };
  next();
});

// ── Rutes (les anem afegint per mòdul) ───────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));      
app.use('/api/horaris',    require('./routes/horaris'));
app.use('/api/activitats', require('./routes/activitats'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/families',      require('./routes/families'));
app.use('/api/dies-especials', require('./routes/diesEspecials'));

// Ruta de health-check per verificar que el servidor respon
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Gestió d'errors global ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('💥 Error no controlat:', err.message);
  res.status(500).json({ error: 'Error intern del servidor.' });
});

// ── Arrencada ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Servidor escoltant a http://localhost:${PORT}`);
});