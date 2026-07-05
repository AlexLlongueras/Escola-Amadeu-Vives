-- ============================================================
-- Migració 012 — Fase 1: Desdoblamens i N:M HORARI_PROFESSOR
-- ============================================================
-- 1. Crea la taula HORARI_PROFESSOR (N:M)
-- 2. Migra les assignacions existents (id_professor de HORARI_LECTIU)
-- 3. Elimina FK_HORARI_PROFESSOR i la columna id_professor
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. Nova taula N:M ──────────────────────────────────────
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Migrar dades existents ──────────────────────────────
INSERT IGNORE INTO HORARI_PROFESSOR (id_horari, id_professor, rol)
SELECT id_horari, id_professor, 'Titular'
FROM   HORARI_LECTIU
WHERE  id_professor IS NOT NULL;

-- ── 3. Eliminar FK i columna id_professor ──────────────────
ALTER TABLE HORARI_LECTIU DROP FOREIGN KEY FK_HORARI_PROFESSOR;

-- Eliminar l'índex associat a la FK (MySQL el crea automàticament)
SET @idx = (
  SELECT INDEX_NAME
  FROM   INFORMATION_SCHEMA.STATISTICS
  WHERE  TABLE_SCHEMA = DATABASE()
    AND  TABLE_NAME   = 'horari_lectiu'
    AND  COLUMN_NAME  = 'id_professor'
    AND  INDEX_NAME  != 'PRIMARY'
  LIMIT 1
);
SET @sql_drop = IF(
  @idx IS NOT NULL,
  CONCAT('ALTER TABLE HORARI_LECTIU DROP INDEX `', @idx, '`'),
  'SELECT "Cap índex id_professor trobat" AS info'
);
PREPARE _s FROM @sql_drop; EXECUTE _s; DEALLOCATE PREPARE _s;

ALTER TABLE HORARI_LECTIU DROP COLUMN id_professor;

-- ── 4. id_aula és opcional (aula pot no estar assignada) ──
ALTER TABLE HORARI_LECTIU MODIFY COLUMN id_aula INT NULL;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Migració 012 aplicada correctament.' AS resultat;
