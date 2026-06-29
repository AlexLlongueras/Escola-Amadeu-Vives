-- =============================================================================
-- Migració 002 v3 — Reset complet + dades de prova multianyals
-- Projecte : Escola Amadeu Vives — Gestió d'Horaris i Activitats
-- Revisió  : v3 — reset total + correcció esquema ALUMNE multi-any
--
-- QUÈ FA AQUEST SCRIPT:
--   0. Corregeix ALUMNE: elimina UNIQUE(id_usuari) → afegeix UNIQUE(id_usuari, any_escolar)
--      Això permet que Joan sigui a '1r A' el 2024/2025 i a '2n A' el 2025/2026.
--   1. Esborra TOTES les dades (reset net)
--   2. Reinicia els auto-increments
--   3. Insereix les 8 aules, 10 assignatures, 10 usuaris, 4 professors, 6 alumnes,
--      4 vincles familiars, 6 grups (3 per any), 55+33 horaris i 9 activitats.
--
-- CONTRASENYES (executa resetPasswordsProva.js per aplicar-les):
--   admin1234    → admin@escolaamadeu.cat
--   profesor1234 → marta, jordi, anna, pere
--   alumne1234   → joan, laia, marc
--   familia1234  → familia.fernandez, familia.garcia
-- =============================================================================

USE escola_amadeu_vives;

-- =============================================================================
-- BLOC 0: CORRECCIÓ D'ESQUEMA — ALUMNE multi-any (idempotent)
-- =============================================================================

-- ORDRE IMPORTANT: primer AFEGIM el nou índex, després ELIMINEM l'antic.
-- MySQL no permet eliminar UQ_ALUMNE_id_usuari mentre el FK FK_ALUMNE_USUARI
-- hi depèn. Però sí accepta substituir-lo per un índex compost (id_usuari, any_escolar)
-- perquè la columna id_usuari segueix sent el prefix esquerre.

-- 1) Afegeix el nou UNIQUE(id_usuari, any_escolar) si no existeix
SET @has_new = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'alumne'
    AND INDEX_NAME = 'UQ_ALUMNE_usuari_any'
);
SET @add_sql = IF(@has_new = 0,
  'ALTER TABLE alumne ADD UNIQUE KEY UQ_ALUMNE_usuari_any (id_usuari, any_escolar)',
  'SELECT ''Index UQ_ALUMNE_usuari_any ja existeix'' AS info');
PREPARE stmt FROM @add_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Ara sí podem eliminar l'índex simple antic (el FK ja usa el nou índex compost)
SET @has_old = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'alumne'
    AND INDEX_NAME = 'UQ_ALUMNE_id_usuari'
);
SET @drop_sql = IF(@has_old > 0,
  'ALTER TABLE alumne DROP INDEX UQ_ALUMNE_id_usuari',
  'SELECT ''Index UQ_ALUMNE_id_usuari ja no existeix'' AS info');
PREPARE stmt FROM @drop_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =============================================================================
-- BLOC 1: RESET COMPLET (FK desactivades per poder esborrar en qualsevol ordre)
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM inscripcio_activitat;
DELETE FROM activitat_extraescolar;
DELETE FROM horari_lectiu;
DELETE FROM familia_alumne;
DELETE FROM alumne;
DELETE FROM grups_classe;
DELETE FROM profesor;
DELETE FROM usuari;
DELETE FROM aula;
DELETE FROM asignatura;

-- Reinicia els comptadors auto-increment
ALTER TABLE inscripcio_activitat    AUTO_INCREMENT = 1;
ALTER TABLE activitat_extraescolar  AUTO_INCREMENT = 1;
ALTER TABLE horari_lectiu           AUTO_INCREMENT = 1;
ALTER TABLE alumne                  AUTO_INCREMENT = 1;
ALTER TABLE grups_classe            AUTO_INCREMENT = 1;
ALTER TABLE profesor                AUTO_INCREMENT = 1;
ALTER TABLE usuari                  AUTO_INCREMENT = 1;
ALTER TABLE aula                    AUTO_INCREMENT = 1;
ALTER TABLE asignatura              AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;


-- =============================================================================
-- BLOC 2: AULES  (8 espais; tipo: 'clase' | 'laboratori' | 'gimnas')
-- =============================================================================

INSERT INTO AULA (id_aula, nom_aula, capacitat, tipo) VALUES
  (1, 'Aula P5 A',           25, 'clase'),
  (2, 'Aula 1r A',           28, 'clase'),
  (3, 'Aula 2n B',           28, 'clase'),
  (4, 'Sala d''Informàtica', 22, 'laboratori'),
  (5, 'Sala de Música',      25, 'clase'),
  (6, 'Gimnàs',              35, 'gimnas'),
  (7, 'Laboratori Ciències', 20, 'laboratori'),
  (8, 'Aula Plàstica',       25, 'clase');


-- =============================================================================
-- BLOC 3: ASSIGNATURES  (catàleg permanent, 10 matèries bàsiques)
-- =============================================================================

INSERT INTO ASIGNATURA (id_asignatura, nom_asignatura, color_calendari) VALUES
  (1,  'Matemàtiques',      '#1565c0'),
  (2,  'Llengua Catalana',  '#2e7d32'),
  (3,  'Anglès',            '#e65100'),
  (4,  'Ciències Naturals', '#558b2f'),
  (5,  'Ciències Socials',  '#6a1b9a'),
  (6,  'Educació Física',   '#c62828'),
  (7,  'Música',            '#ad1457'),
  (8,  'Tecnologia',        '#37474f'),
  (9,  'Plàstica',          '#bf360c'),
  (10, 'Valors Ètics',      '#4e342e');


-- =============================================================================
-- BLOC 4: USUARIS  (1 admin + 4 professors + 3 alumnes + 2 famílies)
-- NOTA: passwords placeholder — executa node resetPasswordsProva.js per aplicar
-- =============================================================================

INSERT INTO USUARI (id_usuari, nom_usuari, email, password, rol) VALUES
  (20, 'Administrador',     'admin@escolaamadeu.cat',
   '$2b$10$placeholder.admin.hash.runResetScript', 'admin'),
  (21, 'Marta Puig',        'marta.puig@escolaamadeu.cat',
   '$2b$10$placeholder.marta.hash.runResetScript', 'profesor'),
  (22, 'Jordi Sala',        'jordi.sala@escolaamadeu.cat',
   '$2b$10$placeholder.jordi.hash.runResetScript', 'profesor'),
  (23, 'Anna Vera',         'anna.vera@escolaamadeu.cat',
   '$2b$10$placeholder.anna.hash.runResetScript',  'profesor'),
  (24, 'Pere Mas',          'pere.mas@escolaamadeu.cat',
   '$2b$10$placeholder.pere.hash.runResetScript',  'profesor'),
  (25, 'Joan Fernàndez',    'joan.fernandez@escolaamadeu.cat',
   '$2b$10$placeholder.joan.hash.runResetScript',  'alumne'),
  (26, 'Laia Garcia',       'laia.garcia@escolaamadeu.cat',
   '$2b$10$placeholder.laia.hash.runResetScript',  'alumne'),
  (27, 'Marc Puig',         'marc.puig@escolaamadeu.cat',
   '$2b$10$placeholder.marc.hash.runResetScript',  'alumne'),
  (28, 'Família Fernàndez', 'familia.fernandez@gmail.com',
   '$2b$10$placeholder.ffern.hash.runResetScript', 'familia'),
  (29, 'Família Garcia',    'familia.garcia@gmail.com',
   '$2b$10$placeholder.fgarc.hash.runResetScript', 'familia');


-- =============================================================================
-- BLOC 5: PROFESSORS  (id_profesor 1–4 corresponen als usuaris 21–24)
-- =============================================================================

INSERT INTO PROFESOR (id_profesor, id_usuari, especialitat) VALUES
  (1, 21, 'Matemàtiques i Ciències Naturals'),
  (2, 22, 'Llengua Catalana i Ciències Socials'),
  (3, 23, 'Anglès i Música'),
  (4, 24, 'Educació Física i Tecnologia');


-- =============================================================================
-- BLOC 6: ALUMNES  (ara possible tenir 2 files per usuari gràcies al BLOC 0)
--   Joan (25): 1r A 2024/2025  →  2n A 2025/2026
--   Laia (26): 1r A 2024/2025  →  2n A 2025/2026
--   Marc (27): 2n B 2024/2025  →  3r B 2025/2026
-- =============================================================================

INSERT INTO ALUMNE (id_alumne, id_usuari, grup, curs, any_escolar) VALUES
  (1, 25, '1r A', '1r de Primària', '2024/2025'),
  (2, 26, '1r A', '1r de Primària', '2024/2025'),
  (3, 27, '2n B', '2n de Primària', '2024/2025'),
  (4, 25, '2n A', '2n de Primària', '2025/2026'),
  (5, 26, '2n A', '2n de Primària', '2025/2026'),
  (6, 27, '3r B', '3r de Primària', '2025/2026');


-- =============================================================================
-- BLOC 7: FAMÍLIES
-- IMPORTANT: parentesc és ENUM('pare','mare','tutor_legal') — no 'Pare/Mare'!
-- =============================================================================

INSERT INTO FAMILIA_ALUMNE (id_familia, id_alumne, parentesc) VALUES
  (28, 1, 'pare'),   -- Família Fernàndez → Joan 2024/2025
  (28, 4, 'pare'),   -- Família Fernàndez → Joan 2025/2026
  (29, 2, 'pare'),   -- Família Garcia    → Laia 2024/2025
  (29, 5, 'pare');   -- Família Garcia    → Laia 2025/2026


-- =============================================================================
-- BLOC 8: GRUPS_CLASSE per ANY ESCOLAR
-- ⚠ 2n A i 3r B els crea 003_professors_i_grups_nous.sql (tutors 7 i 8 = migr.003)
-- =============================================================================

-- 2024/2025 (tutor 1=Marta, 2=Jordi, 3=Anna)
INSERT INTO GRUPS_CLASSE (nom, any_escolar, curs, etapa, any_academic, id_tutor) VALUES
  ('1r A', '2024/2025', '1r de Primària', 'Primària', '2024/2025', 1),
  ('2n B', '2024/2025', '2n de Primària', 'Primària', '2024/2025', 2),
  ('P5 A', '2024/2025', 'P5',             'Infantil', '2024/2025', 3);

-- 2025/2026 tutors reassignats — DEMOSTREM ROTACIÓ!
--   Tutor de 1r A: Jordi (era Marta!), 2n B: Marta (era Jordi!), P5 A: Pere (era Anna!)
INSERT INTO GRUPS_CLASSE (nom, any_escolar, curs, etapa, any_academic, id_tutor) VALUES
  ('1r A', '2025/2026', '1r de Primària', 'Primària', '2025/2026', 2),
  ('2n B', '2025/2026', '2n de Primària', 'Primària', '2025/2026', 1),
  ('P5 A', '2025/2026', 'P5',             'Infantil', '2025/2026', 4);


-- =============================================================================
-- BLOC 9: HORARIS 2024/2025
-- =============================================================================

-- ── 1r A · 2024/2025  (tutora Marta Puig, id_profesor=1) ─────────────────────
INSERT INTO HORARI_LECTIU (dia_semana,hora_inici,hora_fi,id_asignatura,id_profesor,id_aula,grup,any_escolar) VALUES
  ('Dilluns',   '09:00:00','10:00:00', 1,1,2,'1r A','2024/2025'),
  ('Dilluns',   '10:00:00','11:00:00', 2,2,2,'1r A','2024/2025'),
  ('Dilluns',   '11:00:00','12:00:00', 3,3,2,'1r A','2024/2025'),
  ('Dilluns',   '12:00:00','13:00:00', 4,1,7,'1r A','2024/2025'),
  ('Dilluns',   '15:00:00','16:00:00', 6,4,6,'1r A','2024/2025'),
  ('Dimarts',   '09:00:00','10:00:00', 1,1,2,'1r A','2024/2025'),
  ('Dimarts',   '10:00:00','11:00:00', 5,2,2,'1r A','2024/2025'),
  ('Dimarts',   '11:00:00','12:00:00', 7,3,5,'1r A','2024/2025'),
  ('Dimarts',   '12:00:00','13:00:00', 2,2,2,'1r A','2024/2025'),
  ('Dimarts',   '15:00:00','16:00:00', 8,4,4,'1r A','2024/2025'),
  ('Dimecres',  '09:00:00','10:00:00', 2,2,2,'1r A','2024/2025'),
  ('Dimecres',  '10:00:00','11:00:00', 1,1,2,'1r A','2024/2025'),
  ('Dimecres',  '11:00:00','12:00:00', 3,3,2,'1r A','2024/2025'),
  ('Dimecres',  '12:00:00','13:00:00', 9,1,8,'1r A','2024/2025'),
  ('Dijous',    '09:00:00','10:00:00', 1,1,2,'1r A','2024/2025'),
  ('Dijous',    '10:00:00','11:00:00', 2,2,2,'1r A','2024/2025'),
  ('Dijous',    '11:00:00','12:00:00', 6,4,6,'1r A','2024/2025'),
  ('Dijous',    '12:00:00','13:00:00', 4,1,7,'1r A','2024/2025'),
  ('Divendres', '09:00:00','10:00:00', 3,3,2,'1r A','2024/2025'),
  ('Divendres', '10:00:00','11:00:00', 1,1,2,'1r A','2024/2025'),
  ('Divendres', '11:00:00','12:00:00',10,2,2,'1r A','2024/2025'),
  ('Divendres', '12:00:00','13:00:00', 7,3,5,'1r A','2024/2025');

-- ── 2n B · 2024/2025  (tutor Jordi Sala, id_profesor=2) ──────────────────────
INSERT INTO HORARI_LECTIU (dia_semana,hora_inici,hora_fi,id_asignatura,id_profesor,id_aula,grup,any_escolar) VALUES
  ('Dilluns',   '09:00:00','10:00:00', 2,2,3,'2n B','2024/2025'),
  ('Dilluns',   '10:00:00','11:00:00', 1,1,3,'2n B','2024/2025'),
  ('Dilluns',   '11:00:00','12:00:00', 5,2,3,'2n B','2024/2025'),
  ('Dilluns',   '12:00:00','13:00:00', 6,4,6,'2n B','2024/2025'),
  ('Dilluns',   '15:00:00','16:00:00', 3,3,3,'2n B','2024/2025'),
  ('Dimarts',   '09:00:00','10:00:00', 1,1,3,'2n B','2024/2025'),
  ('Dimarts',   '10:00:00','11:00:00', 2,2,3,'2n B','2024/2025'),
  ('Dimarts',   '11:00:00','12:00:00', 4,1,7,'2n B','2024/2025'),
  ('Dimarts',   '12:00:00','13:00:00', 7,3,5,'2n B','2024/2025'),
  ('Dimarts',   '15:00:00','16:00:00', 8,4,4,'2n B','2024/2025'),
  ('Dimecres',  '09:00:00','10:00:00', 3,3,3,'2n B','2024/2025'),
  ('Dimecres',  '10:00:00','11:00:00', 1,1,3,'2n B','2024/2025'),
  ('Dimecres',  '11:00:00','12:00:00', 2,2,3,'2n B','2024/2025'),
  ('Dimecres',  '12:00:00','13:00:00', 9,3,8,'2n B','2024/2025'),
  ('Dijous',    '09:00:00','10:00:00', 2,2,3,'2n B','2024/2025'),
  ('Dijous',    '10:00:00','11:00:00', 5,2,3,'2n B','2024/2025'),
  ('Dijous',    '11:00:00','12:00:00', 1,1,3,'2n B','2024/2025'),
  ('Dijous',    '12:00:00','13:00:00', 6,4,6,'2n B','2024/2025'),
  ('Divendres', '09:00:00','10:00:00', 1,1,3,'2n B','2024/2025'),
  ('Divendres', '10:00:00','11:00:00', 3,3,3,'2n B','2024/2025'),
  ('Divendres', '11:00:00','12:00:00', 7,3,5,'2n B','2024/2025'),
  ('Divendres', '12:00:00','13:00:00',10,2,3,'2n B','2024/2025');

-- ── P5 A · 2024/2025  (tutora Anna Vera, id_profesor=3) ──────────────────────
INSERT INTO HORARI_LECTIU (dia_semana,hora_inici,hora_fi,id_asignatura,id_profesor,id_aula,grup,any_escolar) VALUES
  ('Dilluns',   '09:00:00','10:00:00', 2,2,1,'P5 A','2024/2025'),
  ('Dilluns',   '10:00:00','11:00:00', 7,3,5,'P5 A','2024/2025'),
  ('Dilluns',   '11:00:00','12:00:00', 6,4,6,'P5 A','2024/2025'),
  ('Dimarts',   '09:00:00','10:00:00', 3,3,1,'P5 A','2024/2025'),
  ('Dimarts',   '10:00:00','11:00:00', 9,3,8,'P5 A','2024/2025'),
  ('Dimecres',  '09:00:00','10:00:00', 7,3,5,'P5 A','2024/2025'),
  ('Dimecres',  '10:00:00','11:00:00', 2,2,1,'P5 A','2024/2025'),
  ('Dijous',    '09:00:00','10:00:00', 6,4,6,'P5 A','2024/2025'),
  ('Dijous',    '10:00:00','11:00:00', 3,3,1,'P5 A','2024/2025'),
  ('Divendres', '09:00:00','10:00:00', 2,2,1,'P5 A','2024/2025'),
  ('Divendres', '10:00:00','11:00:00', 7,3,5,'P5 A','2024/2025');


-- =============================================================================
-- BLOC 10: HORARIS 2025/2026 (3 grups bàsics — 2n A i 3r B van a migr.003)
-- =============================================================================

-- ── 1r A · 2025/2026  (tutor Jordi Sala — DIFERENT que 24/25!) ───────────────
INSERT INTO HORARI_LECTIU (dia_semana,hora_inici,hora_fi,id_asignatura,id_profesor,id_aula,grup,any_escolar) VALUES
  ('Dilluns',   '09:00:00','10:00:00', 2,2,2,'1r A','2025/2026'),
  ('Dilluns',   '10:00:00','11:00:00', 1,1,2,'1r A','2025/2026'),
  ('Dilluns',   '11:00:00','12:00:00', 5,2,2,'1r A','2025/2026'),
  ('Dilluns',   '12:00:00','13:00:00', 3,3,2,'1r A','2025/2026'),
  ('Dilluns',   '15:00:00','16:00:00', 7,3,5,'1r A','2025/2026'),
  ('Dimarts',   '09:00:00','10:00:00', 1,1,2,'1r A','2025/2026'),
  ('Dimarts',   '10:00:00','11:00:00', 2,2,2,'1r A','2025/2026'),
  ('Dimarts',   '11:00:00','12:00:00', 6,4,6,'1r A','2025/2026'),
  ('Dimarts',   '12:00:00','13:00:00', 4,1,7,'1r A','2025/2026'),
  ('Dimarts',   '15:00:00','16:00:00', 8,4,4,'1r A','2025/2026'),
  ('Dimecres',  '09:00:00','10:00:00', 1,1,2,'1r A','2025/2026'),
  ('Dimecres',  '10:00:00','11:00:00', 3,3,2,'1r A','2025/2026'),
  ('Dimecres',  '11:00:00','12:00:00', 2,2,2,'1r A','2025/2026'),
  ('Dimecres',  '12:00:00','13:00:00', 9,3,8,'1r A','2025/2026'),
  ('Dijous',    '09:00:00','10:00:00', 2,2,2,'1r A','2025/2026'),
  ('Dijous',    '10:00:00','11:00:00', 1,1,2,'1r A','2025/2026'),
  ('Dijous',    '11:00:00','12:00:00', 4,1,7,'1r A','2025/2026'),
  ('Dijous',    '12:00:00','13:00:00', 6,4,6,'1r A','2025/2026'),
  ('Divendres', '09:00:00','10:00:00', 1,1,2,'1r A','2025/2026'),
  ('Divendres', '10:00:00','11:00:00', 2,2,2,'1r A','2025/2026'),
  ('Divendres', '11:00:00','12:00:00', 3,3,2,'1r A','2025/2026'),
  ('Divendres', '12:00:00','13:00:00',10,2,2,'1r A','2025/2026');

-- ── 2n B · 2025/2026  (tutora Marta Puig — DIFERENT que 24/25!) ──────────────
INSERT INTO HORARI_LECTIU (dia_semana,hora_inici,hora_fi,id_asignatura,id_profesor,id_aula,grup,any_escolar) VALUES
  ('Dilluns',   '09:00:00','10:00:00', 1,1,3,'2n B','2025/2026'),
  ('Dilluns',   '10:00:00','11:00:00', 2,2,3,'2n B','2025/2026'),
  ('Dilluns',   '11:00:00','12:00:00', 4,1,7,'2n B','2025/2026'),
  ('Dilluns',   '12:00:00','13:00:00', 3,3,3,'2n B','2025/2026'),
  ('Dilluns',   '15:00:00','16:00:00', 6,4,6,'2n B','2025/2026'),
  ('Dimarts',   '09:00:00','10:00:00', 2,2,3,'2n B','2025/2026'),
  ('Dimarts',   '10:00:00','11:00:00', 1,1,3,'2n B','2025/2026'),
  ('Dimarts',   '11:00:00','12:00:00', 5,2,3,'2n B','2025/2026'),
  ('Dimarts',   '12:00:00','13:00:00', 7,3,5,'2n B','2025/2026'),
  ('Dimarts',   '15:00:00','16:00:00', 8,4,4,'2n B','2025/2026'),
  ('Dimecres',  '09:00:00','10:00:00', 1,1,3,'2n B','2025/2026'),
  ('Dimecres',  '10:00:00','11:00:00', 3,3,3,'2n B','2025/2026'),
  ('Dimecres',  '11:00:00','12:00:00', 2,2,3,'2n B','2025/2026'),
  ('Dimecres',  '12:00:00','13:00:00', 9,3,8,'2n B','2025/2026'),
  ('Dijous',    '09:00:00','10:00:00', 2,2,3,'2n B','2025/2026'),
  ('Dijous',    '10:00:00','11:00:00', 1,1,3,'2n B','2025/2026'),
  ('Dijous',    '11:00:00','12:00:00', 4,1,7,'2n B','2025/2026'),
  ('Dijous',    '12:00:00','13:00:00', 6,4,6,'2n B','2025/2026'),
  ('Divendres', '09:00:00','10:00:00', 3,3,3,'2n B','2025/2026'),
  ('Divendres', '10:00:00','11:00:00', 1,1,3,'2n B','2025/2026'),
  ('Divendres', '11:00:00','12:00:00', 5,2,3,'2n B','2025/2026'),
  ('Divendres', '12:00:00','13:00:00',10,2,3,'2n B','2025/2026');

-- ── P5 A · 2025/2026  (tutor Pere Mas — NOU tutor!) ──────────────────────────
INSERT INTO HORARI_LECTIU (dia_semana,hora_inici,hora_fi,id_asignatura,id_profesor,id_aula,grup,any_escolar) VALUES
  ('Dilluns',   '09:00:00','10:00:00', 6,4,6,'P5 A','2025/2026'),
  ('Dilluns',   '10:00:00','11:00:00', 2,2,1,'P5 A','2025/2026'),
  ('Dilluns',   '11:00:00','12:00:00', 7,3,5,'P5 A','2025/2026'),
  ('Dimarts',   '09:00:00','10:00:00', 3,3,1,'P5 A','2025/2026'),
  ('Dimarts',   '10:00:00','11:00:00', 8,4,4,'P5 A','2025/2026'),
  ('Dimecres',  '09:00:00','10:00:00', 2,2,1,'P5 A','2025/2026'),
  ('Dimecres',  '10:00:00','11:00:00', 6,4,6,'P5 A','2025/2026'),
  ('Dijous',    '09:00:00','10:00:00', 7,3,5,'P5 A','2025/2026'),
  ('Dijous',    '10:00:00','11:00:00', 9,4,8,'P5 A','2025/2026'),
  ('Divendres', '09:00:00','10:00:00', 3,3,1,'P5 A','2025/2026'),
  ('Divendres', '10:00:00','11:00:00', 2,2,1,'P5 A','2025/2026');


-- =============================================================================
-- BLOC 11: ACTIVITATS EXTRAESCOLARS  (2024/2025 + 2025/2026)
-- =============================================================================

INSERT INTO ACTIVITAT_EXTRAESCOLAR
  (nom, dia_semana, hora_inici, hora_fi, id_aula, responsable, places_maximes, any_escolar)
VALUES
  -- 2024/2025
  ('Bàsquet Escolar',     'Dilluns',  '16:00:00','17:00:00', 6, 'Pere Mas',    15, '2024/2025'),
  ('Taller de Robòtica',  'Dimarts',  '16:00:00','17:00:00', 4, 'Jordi Sala',  12, '2024/2025'),
  ('Coral Escolar',       'Dimecres', '16:00:00','17:00:00', 5, 'Anna Vera',   20, '2024/2025'),
  ('Reforç Matemàtiques', 'Dijous',   '16:00:00','17:00:00', 2, 'Marta Puig', 10, '2024/2025'),
  -- 2025/2026
  ('Bàsquet Escolar',     'Dilluns',  '16:00:00','17:00:00', 6, 'Pere Mas',    18, '2025/2026'),
  ('Taller de Robòtica',  'Dimarts',  '16:00:00','17:00:00', 4, 'Jordi Sala',  12, '2025/2026'),
  ('Coral Escolar',       'Dimecres', '16:00:00','17:00:00', 5, 'Anna Vera',   20, '2025/2026'),
  ('Futbol Sala',         'Dijous',   '16:00:00','17:00:00', 6, 'Pere Mas',    14, '2025/2026'),
  ('Club d''Anglès',      'Divendres','16:00:00','17:00:00', 2, 'Anna Vera',    8, '2025/2026');


-- =============================================================================
-- BLOC 12: INSCRIPCIONS
--   Joan (id_alumne=1 per 24/25, id_alumne=4 per 25/26)
--   Laia (id_alumne=2 per 24/25, id_alumne=5 per 25/26)
--   Marc (id_alumne=3 per 24/25, id_alumne=6 per 25/26)
-- =============================================================================

INSERT INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 1, id_activitat FROM ACTIVITAT_EXTRAESCOLAR WHERE nom='Bàsquet Escolar'    AND any_escolar='2024/2025';
INSERT INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 1, id_activitat FROM ACTIVITAT_EXTRAESCOLAR WHERE nom='Taller de Robòtica' AND any_escolar='2024/2025';
INSERT INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 2, id_activitat FROM ACTIVITAT_EXTRAESCOLAR WHERE nom='Coral Escolar'      AND any_escolar='2024/2025';
INSERT INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 3, id_activitat FROM ACTIVITAT_EXTRAESCOLAR WHERE nom='Taller de Robòtica' AND any_escolar='2024/2025';
INSERT INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 4, id_activitat FROM ACTIVITAT_EXTRAESCOLAR WHERE nom='Bàsquet Escolar'    AND any_escolar='2025/2026';
INSERT INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 4, id_activitat FROM ACTIVITAT_EXTRAESCOLAR WHERE nom='Club d''Anglès'     AND any_escolar='2025/2026';
INSERT INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 5, id_activitat FROM ACTIVITAT_EXTRAESCOLAR WHERE nom='Coral Escolar'      AND any_escolar='2025/2026';


-- =============================================================================
-- VERIFICACIÓ FINAL — hauries de veure:
--   AULES        → 8
--   USUARIS      → 10
--   PROFESSORS   → 4
--   ALUMNES      → 6 (3 per any escolar)
--   FAMÍLIES     → 4
--   GRUPS 24/25  → 3
--   GRUPS 25/26  → 3 (2n A i 3r B els afegeix migr.003, total=5 després)
--   HORARIS      → 55 (24/25) + 33 (25/26, migr.003 afegirà 44 més)
--   ACTIVITATS   → 9
--   INSCRIPCIONS → 7
-- =============================================================================

SELECT 'AULES'        AS taula, COUNT(*) AS total FROM aula;
SELECT 'USUARIS'      AS taula, COUNT(*) AS total FROM usuari;
SELECT 'PROFESSORS'   AS taula, COUNT(*) AS total FROM profesor;
SELECT 'ALUMNES'      AS taula, COUNT(*) AS total FROM alumne;
SELECT 'FAMÍLIES'     AS taula, COUNT(*) AS total FROM familia_alumne;
SELECT 'GRUPS 24/25'  AS taula, COUNT(*) AS total FROM grups_classe WHERE any_escolar='2024/2025';
SELECT 'GRUPS 25/26'  AS taula, COUNT(*) AS total FROM grups_classe WHERE any_escolar='2025/2026';
SELECT 'HORARIS 24/25' AS taula, COUNT(*) AS total FROM horari_lectiu WHERE any_escolar='2024/2025';
SELECT 'HORARIS 25/26' AS taula, COUNT(*) AS total FROM horari_lectiu WHERE any_escolar='2025/2026';
SELECT 'ACTIVITATS'   AS taula, COUNT(*) AS total FROM activitat_extraescolar;
SELECT 'INSCRIPCIONS' AS taula, COUNT(*) AS total FROM inscripcio_activitat;
SELECT 'ÍNDEX ALUMNE (esperat: UQ_ALUMNE_usuari_any)' AS check_idx,
       INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='alumne' AND NON_UNIQUE=0 AND INDEX_NAME!='PRIMARY';
