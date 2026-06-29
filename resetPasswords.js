const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');
require('dotenv').config();

async function reset() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const usuaris = [
    { email: 'marta.puig@escolaamadeu.cat',    password: 'profesor1234' },
    { email: 'joan.fernandez@escolaamadeu.cat', password: 'alumne1234'  },
    { email: 'familia.fernandez@gmail.com',     password: 'familia1234' },
  ];

  for (const u of usuaris) {
    const hash = await bcrypt.hash(u.password, 10);
    await conn.execute(
      'UPDATE USUARI SET password = ? WHERE email = ?',
      [hash, u.email]
    );
    console.log(`✅ ${u.email} → longitud hash: ${hash.length}`);
  }

  await conn.end();
  console.log('Fet! Ara pots fer login amb tots els usuaris.');
}

reset().catch(console.error);