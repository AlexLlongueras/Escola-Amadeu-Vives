'use strict';

/**
 * Aplica la migració 012 — Fase 1: Desdoblamens (HORARI_PROFESSOR N:M).
 *
 * Execució:
 *   node scripts/aplicarMigracio012.js
 *
 * Efectes:
 *   1. Crea taula HORARI_PROFESSOR (N:M entre HORARI_LECTIU i PROFESSOR)
 *   2. Migra assignacions existents de HORARI_LECTIU.id_professor
 *   3. Elimina FK_HORARI_PROFESSOR + índex + columna id_professor
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/db');

async function ok(label)  { console.log(`    ✓ ${label}`); }
async function info(label){ console.log(`    ℹ ${label}`); }

async function main() {
  const conn = await pool.getConnection();
  console.log('\n🚀 Migració 012 — Fase 1: Desdoblamens\n');

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // ── 1. Crear HORARI_PROFESSOR ──────────────────────────────────────────────
    process.stdout.write('  ▸ Creant HORARI_PROFESSOR...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS HORARI_PROFESSOR (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        id_horari    INT NOT NULL,
        id_professor INT NOT NULL,
        rol          ENUM(
          'Titular','Reforç','Acollida','Coeducació',
          'SIEI','SIEI+','EE','Auxiliar EE','Vetlladora'
        ) NOT NULL DEFAULT 'Titular',
        id_substitut INT NULL COMMENT 'Professor substitut en vigor',
        CONSTRAINT FK_HP_HORARI    FOREIGN KEY (id_horari)
          REFERENCES HORARI_LECTIU(id_horari) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT FK_HP_PROFESSOR FOREIGN KEY (id_professor)
          REFERENCES PROFESSOR(id_professor)  ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT FK_HP_SUBSTITUT FOREIGN KEY (id_substitut)
          REFERENCES PROFESSOR(id_professor)  ON DELETE SET NULL ON UPDATE CASCADE,
        UNIQUE KEY UQ_HP (id_horari, id_professor),
        INDEX idx_hp_professor (id_professor),
        INDEX idx_hp_substitut (id_substitut)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await ok('HORARI_PROFESSOR creada (o ja existia)');

    // ── 2. Migrar dades existents ──────────────────────────────────────────────
    process.stdout.write('  ▸ Migrant assignacions existents...');

    // Primer comprovem si la columna id_professor encara existeix
    const [[colRow]] = await conn.query(`
      SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'horari_lectiu'
        AND COLUMN_NAME  = 'id_professor'
    `);

    if (colRow.n > 0) {
      const [ins] = await conn.query(`
        INSERT IGNORE INTO HORARI_PROFESSOR (id_horari, id_professor, rol)
        SELECT id_horari, id_professor, 'Titular'
        FROM   HORARI_LECTIU
        WHERE  id_professor IS NOT NULL
      `);
      await ok(`${ins.affectedRows} assignacions migrades`);

      // ── 3. Eliminar FK ───────────────────────────────────────────────────────
      process.stdout.write('  ▸ Eliminant FK_HORARI_PROFESSOR...');
      const [[fkRow]] = await conn.query(`
        SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA     = DATABASE()
          AND TABLE_NAME       = 'horari_lectiu'
          AND CONSTRAINT_NAME  = 'FK_HORARI_PROFESSOR'
          AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
      `);
      if (fkRow.n > 0) {
        await conn.query('ALTER TABLE HORARI_LECTIU DROP FOREIGN KEY FK_HORARI_PROFESSOR');
        await ok('FK eliminada');
      } else {
        await info('FK_HORARI_PROFESSOR no trobada (ja eliminada?)');
      }

      // ── 4. Eliminar índex ────────────────────────────────────────────────────
      process.stdout.write('  ▸ Eliminant índex de id_professor...');
      const [idxRows] = await conn.query(`
        SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'horari_lectiu'
          AND COLUMN_NAME  = 'id_professor'
          AND INDEX_NAME  != 'PRIMARY'
        LIMIT 1
      `);
      if (idxRows.length) {
        const idxName = idxRows[0].INDEX_NAME;
        await conn.query(`ALTER TABLE HORARI_LECTIU DROP INDEX \`${idxName}\``);
        await ok(`Índex \`${idxName}\` eliminat`);
      } else {
        await info('Cap índex de id_professor trobat');
      }

      // ── 5. Eliminar columna ──────────────────────────────────────────────────
      process.stdout.write('  ▸ Eliminant columna id_professor...');
      await conn.query('ALTER TABLE HORARI_LECTIU DROP COLUMN id_professor');
      await ok('Columna id_professor eliminada');

    } else {
      await info('Columna id_professor no existeix — migració ja aplicada prèviament');
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✅ Migració 012 aplicada correctament!\n');

  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    console.error('\n❌ Error durant la migració:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    pool.end().then(() => process.exit(0));
  }
}

main();
