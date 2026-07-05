// scripts/aplicarMigracio.js
// Aplica la refactorització directament via Node.js (evita problemes amb MySQL Workbench)
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function run(conn, sql, desc) {
  try {
    await conn.execute(sql);
    console.log(`  ✓ ${desc}`);
    return true;
  } catch (e) {
    if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
        e.code === 'ER_DROP_INDEX_FK' ||
        e.message.includes("doesn't exist") ||
        e.message.includes('Unknown column') ||
        e.message.includes('already exists') ||
        e.message.includes('Duplicate key name') ||
        e.message.includes('Duplicate entry')) {
      console.log(`  ⚠ ${desc} — ignorat (${e.message.slice(0,60)})`);
      return false;
    }
    console.error(`  ✗ ${desc} — ERROR: ${e.message}`);
    throw e;
  }
}

// Per a query() (multi-statement o sense placeholder)
async function query(conn, sql, desc) {
  try {
    await conn.query(sql);
    console.log(`  ✓ ${desc}`);
    return true;
  } catch (e) {
    if (e.message.includes("doesn't exist") ||
        e.message.includes('already exists') ||
        e.message.includes('Duplicate')) {
      console.log(`  ⚠ ${desc} — ignorat (${e.message.slice(0,60)})`);
      return false;
    }
    console.error(`  ✗ ${desc} — ERROR: ${e.message}`);
    throw e;
  }
}

async function main() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset:  'utf8mb4',
    multipleStatements: false,
  });

  console.log('\n═══════════════════════════════════════════════════');
  console.log(' APLICANT REFACTORITZACIÓ ADMIN-ONLY');
  console.log('═══════════════════════════════════════════════════\n');

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  console.log('  → FK checks desactivats\n');

  // ── BLOC 1: Eliminar taules de rols no-admin ─────────────────────────────
  console.log('BLOC 1: Eliminant taules de rols no-admin...');
  await query(conn, 'DROP TABLE IF EXISTS INSCRIPCIO_ACTIVITAT',  'DROP INSCRIPCIO_ACTIVITAT');
  await query(conn, 'DROP TABLE IF EXISTS ACTIVITAT_EXTRAESCOLAR', 'DROP ACTIVITAT_EXTRAESCOLAR');
  await query(conn, 'DROP TABLE IF EXISTS FAMILIA_ALUMNE',         'DROP FAMILIA_ALUMNE');
  await query(conn, 'DROP TABLE IF EXISTS ALUMNE',                  'DROP ALUMNE');

  // ── BLOC 2: Reestructurar GRUPS_CLASSE ───────────────────────────────────
  console.log('\nBLOC 2: Reestructurant GRUPS_CLASSE...');
  await run(conn, 'ALTER TABLE GRUPS_CLASSE DROP FOREIGN KEY FK_GRUP_TUTOR',
    'DROP FK FK_GRUP_TUTOR');
  await run(conn, 'ALTER TABLE GRUPS_CLASSE DROP COLUMN id_tutor',
    'DROP COLUMN id_tutor');
  await run(conn, 'ALTER TABLE GRUPS_CLASSE DROP COLUMN etapa',
    'DROP COLUMN etapa');
  await run(conn, 'ALTER TABLE GRUPS_CLASSE DROP COLUMN any_academic',
    'DROP COLUMN any_academic');
  await run(conn, 'ALTER TABLE GRUPS_CLASSE MODIFY COLUMN nom VARCHAR(30) NOT NULL',
    'MODIFY COLUMN nom VARCHAR(30)');

  // ── BLOC 3: Reestructurar HORARI_LECTIU ──────────────────────────────────
  console.log('\nBLOC 3: Reestructurant HORARI_LECTIU...');
  // Eliminar FK si existeix (pot no tenir-ne una)
  await run(conn, 'ALTER TABLE HORARI_LECTIU DROP FOREIGN KEY FK_HORARI_PROFESOR',
    'DROP FK FK_HORARI_PROFESOR (si existia)');
  await run(conn, 'ALTER TABLE HORARI_LECTIU DROP COLUMN id_profesor',
    'DROP COLUMN id_profesor');

  // ── BLOC 4: Eliminar taula PROFESOR ──────────────────────────────────────
  console.log('\nBLOC 4: Eliminant taula PROFESOR...');
  // Eliminar FK FK_PROFESOR_USUARI primer
  await run(conn, 'ALTER TABLE PROFESOR DROP FOREIGN KEY FK_PROFESOR_USUARI',
    'DROP FK FK_PROFESOR_USUARI');
  await query(conn, 'DROP TABLE IF EXISTS PROFESOR', 'DROP TABLE PROFESOR');

  // ── BLOC 5: Crear taula PROFESSOR (nova, autònoma) ───────────────────────
  console.log('\nBLOC 5: Creant taula PROFESSOR...');
  await query(conn, `
    CREATE TABLE IF NOT EXISTS PROFESSOR (
      id_professor  INT          AUTO_INCREMENT PRIMARY KEY,
      nom           VARCHAR(100) NOT NULL,
      especialitat  VARCHAR(100) NULL,
      email         VARCHAR(150) NULL,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `, 'CREATE TABLE PROFESSOR');

  // ── BLOC 6: Afegir id_professor a HORARI_LECTIU ──────────────────────────
  console.log('\nBLOC 6: Afegint id_professor a HORARI_LECTIU...');
  await run(conn, 'ALTER TABLE HORARI_LECTIU ADD COLUMN id_professor INT NULL AFTER hora_fi',
    'ADD COLUMN id_professor');
  await run(conn, `
    ALTER TABLE HORARI_LECTIU
      ADD CONSTRAINT FK_HORARI_PROFESSOR
        FOREIGN KEY (id_professor) REFERENCES PROFESSOR(id_professor)
        ON DELETE SET NULL ON UPDATE CASCADE
  `, 'ADD FK FK_HORARI_PROFESSOR');

  // ── BLOC 7: Ampliar GRUPS_CLASSE.nom a VARCHAR(30) ───────────────────────
  console.log('\nBLOC 7: Ampliant varchar grup a HORARI_LECTIU...');
  await run(conn, 'ALTER TABLE HORARI_LECTIU MODIFY COLUMN grup VARCHAR(30) NOT NULL',
    'MODIFY COLUMN grup VARCHAR(30)');

  // ── BLOC 8: Crear CONFIGURACIO_CURS ──────────────────────────────────────
  console.log('\nBLOC 8: Creant taula CONFIGURACIO_CURS...');
  await query(conn, `
    CREATE TABLE IF NOT EXISTS CONFIGURACIO_CURS (
      id_curs      INT        AUTO_INCREMENT PRIMARY KEY,
      any_escolar  VARCHAR(9) NOT NULL,
      data_inici   DATE       NOT NULL,
      data_fi      DATE       NOT NULL,
      actiu        TINYINT(1) NOT NULL DEFAULT 0,
      created_at   TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY UQ_ANY_ESCOLAR (any_escolar)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `, 'CREATE TABLE CONFIGURACIO_CURS');

  // Inserir el curs actiu inicial
  await run(conn, `
    INSERT IGNORE INTO CONFIGURACIO_CURS (any_escolar, data_inici, data_fi, actiu)
    VALUES ('2025/2026', '2025-09-01', '2026-07-31', 1)
  `, 'INSERT curs 2025/2026 actiu');

  // ── BLOC 9: Crear CLASSES_TEMPORALS ──────────────────────────────────────
  console.log('\nBLOC 9: Creant taula CLASSES_TEMPORALS...');
  await query(conn, `
    CREATE TABLE IF NOT EXISTS CLASSES_TEMPORALS (
      id_classe     INT          AUTO_INCREMENT PRIMARY KEY,
      data          DATE         NOT NULL,
      grup          VARCHAR(30)  NOT NULL,
      id_asignatura INT          NOT NULL,
      id_professor  INT          NULL,
      id_aula       INT          NULL,
      hora_inici    TIME         NOT NULL,
      hora_fi       TIME         NOT NULL,
      any_escolar   VARCHAR(9)   NOT NULL,
      nota          VARCHAR(255) NULL,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT FK_CT_ASIG FOREIGN KEY (id_asignatura) REFERENCES ASIGNATURA(id_asignatura),
      CONSTRAINT FK_CT_PROF FOREIGN KEY (id_professor)  REFERENCES PROFESSOR(id_professor)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT FK_CT_AULA FOREIGN KEY (id_aula)       REFERENCES AULA(id_aula)
        ON DELETE SET NULL ON UPDATE CASCADE,
      INDEX idx_ct_grup_any (grup, any_escolar),
      INDEX idx_ct_data (data)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `, 'CREATE TABLE CLASSES_TEMPORALS');

  // ── BLOC 10: Netejar usuaris no-admin ────────────────────────────────────
  console.log('\nBLOC 10: Netejant usuaris no-admin...');
  const [delRes] = await conn.execute("DELETE FROM USUARI WHERE rol != 'admin'");
  console.log(`  ✓ Eliminats ${delRes.affectedRows} usuaris no-admin`);

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('\n  → FK checks reactivats');

  // ── VERIFICACIÓ FINAL ─────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' VERIFICACIÓ FINAL');
  console.log('═══════════════════════════════════════════════════\n');

  const [tables] = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
    [process.env.DB_NAME]
  );
  console.log('Taules existents:');
  tables.forEach(t => console.log(`  ✓ ${t.TABLE_NAME}`));

  console.log('\nColumnes HORARI_LECTIU:');
  const [cols] = await conn.execute(
    `SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'horari_lectiu' ORDER BY ORDINAL_POSITION`,
    [process.env.DB_NAME]
  );
  cols.forEach(c => console.log(`  ${c.COLUMN_NAME.padEnd(20)} ${c.COLUMN_TYPE}`));

  console.log('\nCurs actiu:');
  const [cursos] = await conn.execute('SELECT * FROM CONFIGURACIO_CURS WHERE actiu = 1');
  cursos.forEach(c => console.log(`  ${c.any_escolar} (${c.data_inici} → ${c.data_fi})`));

  console.log('\nUsuaris:');
  const [users] = await conn.execute('SELECT nom_usuari, email, rol FROM USUARI');
  users.forEach(u => console.log(`  [${u.rol}] ${u.nom_usuari} <${u.email}>`));

  await conn.end();
  console.log('\n✅ MIGRACIÓ COMPLETADA CORRECTAMENT\n');
}

main().catch(e => {
  console.error('\n❌ ERROR FATAL:', e.message);
  process.exit(1);
});
