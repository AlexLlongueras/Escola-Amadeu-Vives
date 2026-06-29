-- config/migrations/004_dies_especials.sql
-- Crea la taula DIES_ESPECIALS per gestionar festius, excursions i colònies.
--
-- Disseny:
--   · any_escolar  → filtre multi-curs coherent amb la resta del sistema
--   · grup         → NULL significa que afecta tot el centre (festiu global);
--                    un valor com '1r A' restringeix l'event a un grup concret
--   · data_inici / data_fi → permeten events d'un sol dia (inici = fi)
--                            o de múltiples dies (colònies, sortides de varis dies)
--
-- Índexs:
--   idx_dies_any   → cerca per curs escolar (consulta principal del GET)
--   idx_dies_dates → cerca per rang de dates (paint del calendari setmanal)

CREATE TABLE IF NOT EXISTS DIES_ESPECIALS (
  id_dia           INT            AUTO_INCREMENT PRIMARY KEY,
  nom_esdeveniment VARCHAR(150)   NOT NULL,
  tipus            ENUM('festiu','excursio','colonies') NOT NULL DEFAULT 'festiu',
  data_inici       DATE           NOT NULL,
  data_fi          DATE           NOT NULL,
  grup             VARCHAR(20)    NULL COMMENT 'NULL = afecta tot el centre',
  any_escolar      VARCHAR(9)     NOT NULL,

  CONSTRAINT chk_dies_dates CHECK (data_fi >= data_inici),

  INDEX idx_dies_any   (any_escolar),
  INDEX idx_dies_dates (data_inici, data_fi)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Festius, excursions i colònies per any escolar';
