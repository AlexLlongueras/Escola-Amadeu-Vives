'use strict';

/**
 * Aplica la migració 013 — Rol Suport/TIS + columna id_aula a HORARI_PROFESSOR.
 *
 * Execució:
 *   node scripts/aplicarMigracio013.js
 *
 * Efectes:
 *   1. Reanomena 'Reforç' → 'Suport' en files existents
 *   2. Modifica l'ENUM de `rol` (afegeix 'Suport', 'TIS'; elimina 'Reforç')
 *   3. Afegeix columna `id_aula` (INT NULL) + FK + índex
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/db');

async function ok(label)  { console.log(`    ✓ ${label}`); }
async function info(label){ console.log(`    ℹ ${label}`); }

async function main() {
  const conn = await pool.getConnection();
  console.log('\n🚀 Migració 013 — Rol Suport/TIS + aula per professor de suport\n');

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // ── 1. Actualitzar dades: Reforç → Suport ─────────────────────────────────
    process.stdout.write('  ▸ Reanomenant Reforç → Suport...');
    const [upd] = await conn.query(
      "UPDATE HORARI_PROFESSOR SET rol = 'Suport' WHERE rol = 'Reforç'"
    );
    await ok(`${upd.affectedRows} fila(es) actualitzada(es)`);

    // ── 2. Modificar ENUM ──────────────────────────────────────────────────────
    process.stdout.write('  ▸ Modificant ENUM rol...');
    await conn.query(`
      ALTER TABLE HORARI_PROFESSOR
        MODIFY COLUMN rol ENUM(
          'Titular','Suport','Acollida','Coeducació',
          'SIEI','SIEI+','EE','Auxiliar EE','Vetlladora','TIS'
        ) NOT NULL DEFAULT 'Titular'
    `);
    await ok('ENUM actualitzat (Suport + TIS)');

    // ── 3. Afegir columna id_aula (si no existeix) ────────────────────────────
    process.stdout.write('  ▸ Comprovant columna id_aula...');
    const [[colRow]] = await conn.query(`
      SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'HORARI_PROFESSOR'
        AND COLUMN_NAME  = 'id_aula'
    `);
    if (colRow.n === 0) {
      await conn.query(`
        ALTER TABLE HORARI_PROFESSOR
          ADD COLUMN id_aula INT NULL DEFAULT NULL
            COMMENT 'Aula específica del professor de suport (NULL = mateixa aula principal)'
            AFTER id_substitut
      `);
      await ok('Columna id_aula afegida');
    } else {
      await info('Columna id_aula ja existia');
    }

    // ── 4. Afegir FK cap a AULA (si no existeix) ──────────────────────────────
    process.stdout.write('  ▸ Comprovant FK_HP_AULA...');
    const [[fkRow]] = await conn.query(`
      SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA     = DATABASE()
        AND TABLE_NAME       = 'HORARI_PROFESSOR'
        AND CONSTRAINT_NAME  = 'FK_HP_AULA'
    `);
    if (fkRow.n === 0) {
      await conn.query(`
        ALTER TABLE HORARI_PROFESSOR
          ADD CONSTRAINT FK_HP_AULA
            FOREIGN KEY (id_aula) REFERENCES AULA(id_aula)
            ON DELETE SET NULL ON UPDATE CASCADE
      `);
      await ok('FK FK_HP_AULA creada');
    } else {
      await info('FK_HP_AULA ja existia');
    }

    // ── 5. Índex id_aula (si no existeix) ─────────────────────────────────────
    process.stdout.write('  ▸ Comprovant índex idx_hp_aula...');
    const [[idxRow]] = await conn.query(`
      SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'HORARI_PROFESSOR'
        AND INDEX_NAME   = 'idx_hp_aula'
    `);
    if (idxRow.n === 0) {
      await conn.query('CREATE INDEX idx_hp_aula ON HORARI_PROFESSOR(id_aula)');
      await ok('Índex idx_hp_aula creat');
    } else {
      await info('Índex idx_hp_aula ja existia');
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✅ Migració 013 aplicada correctament.\n');

  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    console.error('\n❌ Error durant la migració 013:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    pool.end();
  }
}

main();
