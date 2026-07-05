'use strict';

require('dotenv').config();
const express = require('express');
require('./config/db'); // test connexio en arrencar

const { carregarAnyEscolarActiu } = require('./utils/anyEscolar');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globals ───────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public', {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    else if (filePath.endsWith('.js'))  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    else if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
  },
}));

app.use((_req, res, next) => {
  const orig = res.json.bind(res);
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return orig(body);
  };
  next();
});

// ── Rutes ─────────────────────────────────────────────────────────────────────

app.use('/api/auth',              require('./routes/auth'));
app.use('/api/horaris',           require('./routes/horaris'));
app.use('/api/admin',             require('./routes/admin'));
app.use('/api/dies-especials',    require('./routes/diesEspecials'));
app.use('/api/configuracio',      require('./routes/configuracio'));
app.use('/api/classes-temporals', require('./routes/classesTemporals'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handler global ──────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('Error no controlat:', err.message);
  res.status(500).json({ error: 'Error intern del servidor.' });
});

// ── Arrencada: carregar any escolar actiu de la BD ────────────────────────────

carregarAnyEscolarActiu()
  .then((any) => {
    console.log(`Any escolar actiu: ${any || '(cap — configura un curs a /api/configuracio)'}`);
    app.listen(PORT, () => {
      console.log(`Servidor escoltant a http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error carregant any escolar:', err.message);
    // Arrenquem igualment amb fallback
    app.listen(PORT, () => {
      console.log(`Servidor (fallback) a http://localhost:${PORT}`);
    });
  });
