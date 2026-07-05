-- ══════════════════════════════════════════════════════════════════════════════
-- Migració 013: Rol Suport/TIS + columna id_aula a HORARI_PROFESSOR
-- ══════════════════════════════════════════════════════════════════════════════
--
--  1. Reanomena 'Reforç' → 'Suport' en les dades existents
--  2. Actualitza l'ENUM de la columna `rol` (treu 'Reforç', afegeix 'Suport' i 'TIS')
--  3. Afegeix la columna `id_aula` (FK opcional a AULA) per a codocència flexible
--
-- Executa'l amb:
--   node scripts/aplicarMigracio013.js
-- ──────────────────────────────────────────────────────────────────────────────

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Actualitzar dades existents: Reforç → Suport
UPDATE HORARI_PROFESSOR SET rol = 'Suport' WHERE rol = 'Reforç';

-- 2. Modificar l'ENUM (inclou 'Suport' i 'TIS', elimina 'Reforç')
ALTER TABLE HORARI_PROFESSOR
  MODIFY COLUMN rol ENUM(
    'Titular','Suport','Acollida','Coeducació',
    'SIEI','SIEI+','EE','Auxiliar EE','Vetlladora','TIS'
  ) NOT NULL DEFAULT 'Titular';

-- 3. Afegir columna id_aula (NULL = mateixa aula que el titular)
ALTER TABLE HORARI_PROFESSOR
  ADD COLUMN IF NOT EXISTS id_aula INT NULL DEFAULT NULL
    COMMENT 'Aula específica del professor de suport (NULL = mateixa aula principal)'
    AFTER id_substitut;

-- 4. FK cap a AULA (si no existeix)
ALTER TABLE HORARI_PROFESSOR
  ADD CONSTRAINT IF NOT EXISTS FK_HP_AULA
    FOREIGN KEY (id_aula) REFERENCES AULA(id_aula)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Índex per a la nova columna
CREATE INDEX IF NOT EXISTS idx_hp_aula ON HORARI_PROFESSOR(id_aula);

SET FOREIGN_KEY_CHECKS = 1;
