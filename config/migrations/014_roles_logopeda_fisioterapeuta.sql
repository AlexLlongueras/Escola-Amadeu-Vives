-- ══════════════════════════════════════════════════════════════════════════════
-- Migració 014: Afegir Logopeda i Fisioterapeuta a l'ENUM de rol
-- ══════════════════════════════════════════════════════════════════════════════
--
--  Amplia la llista de rols de suport amb dos nous perfils professionals:
--    · Logopeda
--    · Fisioterapeuta
--
--  La llista completa de rols de suport passa a ser (10):
--    Suport, Acollida, SIEI, SIEI+, EE, Auxiliar EE, Vetlladora,
--    TIS, Logopeda, Fisioterapeuta
--
-- Executa'l amb:
--   node scripts/aplicarMigracio014.js
-- ──────────────────────────────────────────────────────────────────────────────

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE HORARI_PROFESSOR
  MODIFY COLUMN rol ENUM(
    'Titular','Suport','Acollida','Coeducació',
    'SIEI','SIEI+','EE','Auxiliar EE','Vetlladora',
    'TIS','Logopeda','Fisioterapeuta'
  ) NOT NULL DEFAULT 'Titular';

SET FOREIGN_KEY_CHECKS = 1;
