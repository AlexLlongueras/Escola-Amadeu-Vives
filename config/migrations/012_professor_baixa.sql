-- 012 — Gestió de baixes mèdiques a nivell de professor
-- Afegeix `en_baixa` i `id_substitut` directament a la taula PROFESSOR
-- Permet que el calendari mostri automàticament el substitut quan un titular és de baixa.

ALTER TABLE PROFESSOR
  ADD COLUMN en_baixa     TINYINT(1)  NOT NULL DEFAULT 0    COMMENT '1 = professor en baixa mèdica' AFTER especialitat,
  ADD COLUMN id_substitut INT         NULL                   COMMENT 'Professor substitut global (baixa)' AFTER en_baixa,
  ADD CONSTRAINT fk_prof_substitut_global
    FOREIGN KEY (id_substitut) REFERENCES PROFESSOR(id_professor)
    ON DELETE SET NULL ON UPDATE CASCADE;
