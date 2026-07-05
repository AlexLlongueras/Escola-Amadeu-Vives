-- Migració 015 — Afegir id_aula a HORARI_PROFESSOR
-- Permet que cada professor de suport tingui una aula específica diferent
-- de l'aula principal de la franja. NULL = "mateixa aula que la franja".
-- Aplicada manualment el 2026-07-02.

ALTER TABLE HORARI_PROFESSOR
  ADD COLUMN id_aula INT NULL DEFAULT NULL,
  ADD CONSTRAINT FK_HP_aula FOREIGN KEY (id_aula) REFERENCES AULA(id_aula) ON DELETE SET NULL;
