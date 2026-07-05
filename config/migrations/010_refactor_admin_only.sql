-- =============================================================================
-- Migració 010 — Refactor Admin-Only
-- Projecte : Escola Amadeu Vives — Gestió d'Horaris (v2)
-- Data      : 2026-06-23
--
-- QUÈ FA:
--   1. Elimina taules de rols no-admin (INSCRIPCIO_ACTIVITAT, ACTIVITAT_EXTRAESCOLAR,
--      FAMILIA_ALUMNE, ALUMNE)
--   2. Elimina la taula PROFESOR relacional i la substitueix per PROFESSOR (simple)
--   3. Reestructura HORARI_LECTIU per usar id_professor (nova taula)
--   4. Simplifica GRUPS_CLASSE (elimina id_tutor)
--   5. Crea CONFIGURACIO_CURS (any escolar actiu gestionat per l'admin)
--   6. Crea CLASSES_TEMPORALS (classes d'un sol dia)
--   7. Elimina usuaris no-admin
--
-- INSTRUCCIONS:
--   Executa a MySQL Workbench: File → Open SQL Script → Execute (⚡)
--   IMPORTANT: Fes una còpia de seguretat de la BD abans d'executar.
-- =============================================================================

USE escola_amadeu_vives;

SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- BLOC 1: ELIMINAR TAULES DE ROLS NO-ADMIN
-- =============================================================================

DROP TABLE IF EXISTS INSCRIPCIO_ACTIVITAT;
DROP TABLE IF EXISTS ACTIVITAT_EXTRAESCOLAR;
DROP TABLE IF EXISTS FAMILIA_ALUMNE;
DROP TABLE IF EXISTS ALUMNE;

-- =============================================================================
-- BLOC 2: REESTRUCTURAR HORARI_LECTIU
-- Eliminar la columna id_profesor (FK cap a PROFESOR, taula que eliminarem)
-- i afegir id_professor (FK cap a la nova taula PROFESSOR)
-- =============================================================================

-- Eliminar tots els índexs i FKs que facin referència a id_profesor
-- (el nom pot variar; usem INFORMATION_SCHEMA per trobar-lo)
SET @fk_horari_profesor = (
  SELECT CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'horari_lectiu'
    AND COLUMN_NAME  = 'id_profesor'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @drop_fk_horari = IF(
  @fk_horari_profesor IS NOT NULL,
  CONCAT('ALTER TABLE HORARI_LECTIU DROP FOREIGN KEY ', @fk_horari_profesor),
  'SELECT "No FK id_profesor a HORARI_LECTIU" AS info'
);
PREPARE s FROM @drop_fk_horari; EXECUTE s; DEALLOCATE PREPARE s;

-- Eliminar l'índex simple de id_profesor si existeix
SET @idx_horari_prof = (
  SELECT INDEX_NAME
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'horari_lectiu'
    AND COLUMN_NAME  = 'id_profesor'
    AND INDEX_NAME  != 'PRIMARY'
  LIMIT 1
);
SET @drop_idx_horari = IF(
  @idx_horari_prof IS NOT NULL,
  CONCAT('ALTER TABLE HORARI_LECTIU DROP INDEX ', @idx_horari_prof),
  'SELECT "No index id_profesor" AS info'
);
PREPARE s FROM @drop_idx_horari; EXECUTE s; DEALLOCATE PREPARE s;

-- Eliminar la columna id_profesor
ALTER TABLE HORARI_LECTIU DROP COLUMN IF EXISTS id_profesor;

-- =============================================================================
-- BLOC 3: REESTRUCTURAR GRUPS_CLASSE
-- Eliminar id_tutor (FK cap a PROFESOR) i columnes redundants
-- =============================================================================

SET @fk_grups_tutor = (
  SELECT CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'grups_classe'
    AND COLUMN_NAME  = 'id_tutor'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @drop_fk_grups = IF(
  @fk_grups_tutor IS NOT NULL,
  CONCAT('ALTER TABLE GRUPS_CLASSE DROP FOREIGN KEY ', @fk_grups_tutor),
  'SELECT "No FK id_tutor a GRUPS_CLASSE" AS info'
);
PREPARE s FROM @drop_fk_grups; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE GRUPS_CLASSE DROP COLUMN IF EXISTS id_tutor;
ALTER TABLE GRUPS_CLASSE DROP COLUMN IF EXISTS etapa;
ALTER TABLE GRUPS_CLASSE DROP COLUMN IF EXISTS any_academic;

-- Afegim columna curs si no existeix (per mantenir compatibilitat)
ALTER TABLE GRUPS_CLASSE
  MODIFY COLUMN nom VARCHAR(30) NOT NULL,
  MODIFY COLUMN any_escolar VARCHAR(9) NOT NULL;

-- =============================================================================
-- BLOC 4: ELIMINAR TAULA PROFESOR
-- =============================================================================

-- Verificar que no queden FKs cap a PROFESOR
SET @fk_remaining = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA     = DATABASE()
    AND REFERENCED_TABLE_NAME = 'profesor'
);

DROP TABLE IF EXISTS PROFESOR;

-- =============================================================================
-- BLOC 5: CREAR TAULA PROFESSOR (nova, autònoma)
-- =============================================================================

CREATE TABLE IF NOT EXISTS PROFESSOR (
  id_professor  INT          AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  especialitat  VARCHAR(100) NULL,
  email         VARCHAR(150) NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- BLOC 6: AFEGIR id_professor A HORARI_LECTIU
-- =============================================================================

ALTER TABLE HORARI_LECTIU
  ADD COLUMN IF NOT EXISTS id_professor INT NULL AFTER hora_fi;

-- Afegir FK (si PROFESSOR ja existeix)
ALTER TABLE HORARI_LECTIU
  ADD CONSTRAINT FK_HORARI_PROFESSOR
    FOREIGN KEY (id_professor) REFERENCES PROFESSOR(id_professor)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- =============================================================================
-- BLOC 7: CREAR TAULA CONFIGURACIO_CURS
-- =============================================================================

CREATE TABLE IF NOT EXISTS CONFIGURACIO_CURS (
  id_curs      INT        AUTO_INCREMENT PRIMARY KEY,
  any_escolar  VARCHAR(9) NOT NULL,
  data_inici   DATE       NOT NULL,
  data_fi      DATE       NOT NULL,
  actiu        TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY UQ_ANY_ESCOLAR (any_escolar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inserir el curs actiu inicial (2025/2026)
INSERT IGNORE INTO CONFIGURACIO_CURS (any_escolar, data_inici, data_fi, actiu)
VALUES ('2025/2026', '2025-09-01', '2026-07-31', 1);

-- =============================================================================
-- BLOC 8: CREAR TAULA CLASSES_TEMPORALS
-- =============================================================================

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
  CONSTRAINT FK_CT_ASIG FOREIGN KEY (id_asignatura) REFERENCES ASIGNATURA(id_asignatura)
    ON DELETE RESTRICT,
  CONSTRAINT FK_CT_PROF FOREIGN KEY (id_professor)  REFERENCES PROFESSOR(id_professor)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT FK_CT_AULA FOREIGN KEY (id_aula)       REFERENCES AULA(id_aula)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_ct_grup_any  (grup, any_escolar),
  INDEX idx_ct_data      (data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- BLOC 9: NETEJAR USUARIS NO-ADMIN
-- =============================================================================

DELETE FROM USUARI WHERE rol != 'admin';

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- VERIFICACIÓ FINAL
-- =============================================================================
SELECT 'Migració 010 completada.' AS resultat;
SELECT TABLE_NAME, TABLE_ROWS
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('PROFESSOR','CONFIGURACIO_CURS','CLASSES_TEMPORALS',
                     'HORARI_LECTIU','GRUPS_CLASSE','USUARI')
ORDER BY TABLE_NAME;
