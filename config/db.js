// config/db.js
// Crea i exporta un pool de connexions reutilitzables a MySQL.
// Usem mysql2/promise per poder usar async/await als models.

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset:  'utf8mb4',       // ← UTF-8 complet (accents, ç, emojis…)
  timezone: 'local',         // evita desfasaments horaris
  waitForConnections: true,
  connectionLimit:    10,    // màx. connexions simultànies
  queueLimit:         0,     // cua il·limitada
});

// Test de connexió en arrencar (no bloquejant)
pool.getConnection()
  .then(conn => {
    console.log('✅ Connexió a MySQL establerta correctament.');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Error connectant a MySQL:', err.message);
    process.exit(1); // Atura el servidor si la BD no és accessible
  });

module.exports = pool;