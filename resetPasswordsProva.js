// resetPasswordsProva.js
// Assigna contrasenyes correctes (hash bcrypt) a TOTS els usuaris de prova.
// Executa: node resetPasswordsProva.js
//
// CONTRASENYES DE PROVA:
//   admin1234    → admin@escolaamadeu.cat
//   profesor1234 → tots els professors (marta, jordi, anna, pere)
//   alumne1234   → tots els alumnes   (joan, laia, marc)
//   familia1234  → totes les famílies (fernandez, garcia)

'use strict';

const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');
require('dotenv').config();

const SALT_ROUNDS = 10;

const USUARIS = [
  { email: 'admin@escolaamadeu.cat',          password: 'admin1234'    },
  { email: 'marta.puig@escolaamadeu.cat',     password: 'profesor1234' },
  { email: 'jordi.sala@escolaamadeu.cat',     password: 'profesor1234' },
  { email: 'anna.vera@escolaamadeu.cat',      password: 'profesor1234' },
  { email: 'pere.mas@escolaamadeu.cat',       password: 'profesor1234' },
  { email: 'joan.fernandez@escolaamadeu.cat', password: 'alumne1234'   },
  { email: 'laia.garcia@escolaamadeu.cat',    password: 'alumne1234'   },
  { email: 'marc.puig@escolaamadeu.cat',      password: 'alumne1234'   },
  { email: 'familia.fernandez@gmail.com',     password: 'familia1234'  },
  { email: 'familia.garcia@gmail.com',        password: 'familia1234'  },
  // ── Professors nous (migració 003) ──
  { email: 'carles.rio@escolaamadeu.cat',     password: 'profesor1234' },
  { email: 'neus.font@escolaamadeu.cat',      password: 'profesor1234' },
  { email: 'lluc.valls@escolaamadeu.cat',     password: 'profesor1234' },
  { email: 'silvia.pons@escolaamadeu.cat',    password: 'profesor1234' },
];

async function resetPasswords() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('🔑 Resetting passwords...\n');

  for (const u of USUARIS) {
    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    const [result] = await conn.execute(
      'UPDATE USUARI SET password = ? WHERE email = ?',
      [hash, u.email]
    );

    if (result.affectedRows > 0) {
      console.log(`✅  ${u.email.padEnd(42)} → ${u.password}`);
    } else {
      console.log(`⚠️  ${u.email.padEnd(42)} → NO TROBAT a la BD (executa primer 002_dades_prova.sql)`);
    }
  }

  await conn.end();
  console.log('\n✔ Fet! Pots fer login amb tots els usuaris de prova.');
  console.log('\nRESUM DE COMPTES:');
  console.log('  admin@escolaamadeu.cat          → admin1234    (Administrador)');
  console.log('  marta.puig@escolaamadeu.cat     → profesor1234 (Professor, tutora 1r A 24/25)');
  console.log('  jordi.sala@escolaamadeu.cat     → profesor1234 (Professor, tutor 1r A 25/26)');
  console.log('  anna.vera@escolaamadeu.cat      → profesor1234 (Professor, tutora P5 A 24/25)');
  console.log('  pere.mas@escolaamadeu.cat       → profesor1234 (Professor, tutor P5 A 25/26)');
  console.log('  joan.fernandez@escolaamadeu.cat → alumne1234   (Alumne: 1r A 24/25 → 2n A 25/26)');
  console.log('  laia.garcia@escolaamadeu.cat    → alumne1234   (Alumne: 1r A 24/25 → 2n A 25/26)');
  console.log('  marc.puig@escolaamadeu.cat      → alumne1234   (Alumne: 2n B 24/25 → 3r B 25/26)');
  console.log('  familia.fernandez@gmail.com     → familia1234  (Família de Joan Fernàndez)');
  console.log('  familia.garcia@gmail.com        → familia1234  (Família de Laia Garcia)');
  console.log('  carles.rio@escolaamadeu.cat     → profesor1234 (Prof nou: Ed.Física avançada)');
  console.log('  neus.font@escolaamadeu.cat      → profesor1234 (Prof nova: Música i Arts)');
  console.log('  lluc.valls@escolaamadeu.cat     → profesor1234 (Prof nou: Ciències i Tecnologia)');
  console.log('  silvia.pons@escolaamadeu.cat    → profesor1234 (Prof nova: Llengua i Socials)');
}

resetPasswords().catch(console.error);
