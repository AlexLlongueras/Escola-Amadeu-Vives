// scripts/diagnosticDB.js — diagnòstic de l'estat de la base de dades
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, charset: 'utf8mb4',
  });

  console.log('\n═══════════════════════════════════════');
  console.log(' DIAGNÒSTIC BD:', process.env.DB_NAME);
  console.log('═══════════════════════════════════════\n');

  // 1. Totes les taules
  const [tables] = await conn.execute(
    `SELECT TABLE_NAME, TABLE_ROWS
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
    [process.env.DB_NAME]
  );
  console.log('TAULES EXISTENTS:');
  tables.forEach(t => console.log(`  ✓ ${t.TABLE_NAME.padEnd(30)} (aprox. ${t.TABLE_ROWS ?? 0} files)`));

  // 2. Columnes de HORARI_LECTIU
  console.log('\nCOLUMNES HORARI_LECTIU:');
  try {
    const [cols] = await conn.execute(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'horari_lectiu'
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME]
    );
    cols.forEach(c => console.log(`  ${c.COLUMN_NAME.padEnd(25)} ${c.COLUMN_TYPE.padEnd(20)} NULL:${c.IS_NULLABLE}`));
  } catch { console.log('  (taula no existeix)'); }

  // 3. Columnes de GRUPS_CLASSE
  console.log('\nCOLUMNES GRUPS_CLASSE:');
  try {
    const [cols] = await conn.execute(
      `SELECT COLUMN_NAME, COLUMN_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'grups_classe'
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME]
    );
    cols.forEach(c => console.log(`  ${c.COLUMN_NAME.padEnd(25)} ${c.COLUMN_TYPE}`));
  } catch { console.log('  (taula no existeix)'); }

  // 4. FKs actives
  console.log('\nFOREIGN KEYS ACTIVES:');
  const [fks] = await conn.execute(
    `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY TABLE_NAME, COLUMN_NAME`,
    [process.env.DB_NAME]
  );
  if (!fks.length) console.log('  (cap FK trobada)');
  fks.forEach(f => console.log(`  ${f.TABLE_NAME}.${f.COLUMN_NAME} → ${f.REFERENCED_TABLE_NAME}.${f.REFERENCED_COLUMN_NAME} [${f.CONSTRAINT_NAME}]`));

  // 5. Usuaris
  console.log('\nUSUARIS:');
  try {
    const [users] = await conn.execute('SELECT id_usuari, nom_usuari, email, rol FROM USUARI');
    users.forEach(u => console.log(`  [${u.rol}] ${u.nom_usuari} <${u.email}>`));
  } catch { console.log('  (error llegint USUARI)'); }

  // 6. Configuració curs
  console.log('\nCONFIGURACIO_CURS:');
  try {
    const [cursos] = await conn.execute('SELECT * FROM CONFIGURACIO_CURS');
    if (!cursos.length) console.log('  (taula buida)');
    cursos.forEach(c => console.log(`  id:${c.id_curs} ${c.any_escolar} actiu:${c.actiu}`));
  } catch (e) { console.log('  ERROR:', e.message); }

  await conn.end();
  console.log('\n═══════════════════════════════════════\n');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
