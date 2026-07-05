'use strict';

/**
 * Aplica la migració 014 — Afegir Logopeda i Fisioterapeuta a l'ENUM de rol.
 *
 * Execució:
 *   node scripts/aplicarMigracio014.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/db');

async function main() {
  const conn = await pool.getConnection();
  console.log('\n🚀 Migració 014 — Rols Logopeda i Fisioterapeuta\n');

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Pas 1: Canviar a VARCHAR temporalment per poder actualitzar dades sense restriccions ENUM
    process.stdout.write('  ▸ Canviant rol a VARCHAR temporal...');
    await conn.query(
      "ALTER TABLE HORARI_PROFESSOR MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'Titular'"
    );
    console.log('    ✓ Fet');

    // Pas 2: Renomenar valors legacy
    process.stdout.write('  ▸ Reanomenant Reforç → Suport...');
    const [upd] = await conn.query(
      "UPDATE HORARI_PROFESSOR SET rol = 'Suport' WHERE rol = 'Reforç'"
    );
    console.log(`    ✓ ${upd.affectedRows} fila(es) actualitzada(es)`);

    // Pas 3: Aplicar l'ENUM definitiu amb tots els rols oficials
    process.stdout.write('  ▸ Aplicant ENUM definitiu...');
    await conn.query(`
      ALTER TABLE HORARI_PROFESSOR
        MODIFY COLUMN rol ENUM(
          'Titular','Suport','Acollida','Coeducació',
          'SIEI','SIEI+','EE','Auxiliar EE','Vetlladora',
          'TIS','Logopeda','Fisioterapeuta'
        ) NOT NULL DEFAULT 'Titular'
    `);
    console.log('    ✓ ENUM definitiu aplicat');

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✅ Migració 014 aplicada correctament.\n');

  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    console.error('\n❌ Error durant la migració 014:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    pool.end();
  }
}

main();
