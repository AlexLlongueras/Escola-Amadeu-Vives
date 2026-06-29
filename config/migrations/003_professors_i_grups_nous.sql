-- =============================================================================
-- Migració 003 — Professors nous + Grups ampliats + Horaris complets
-- Projecte : Escola Amadeu Vives — Gestió d'Horaris i Activitats
-- Data      : 2026-05-27
--
-- OBJECTIU:
--   Ampliar el sistema de prova amb 4 professors nous i 2 grups addicionals
--   exclusius de 2025/2026 (2n A i 3r B), de manera que:
--     · En canviar l'any al selector, es vegin grups i horaris completament
--       diferents (professors, hores i assignatures canviats)
--     · Joan Fernàndez (alumne) veu '1r A' el 2024/2025 i '2n A' el 2025/2026
--     · Marc Puig veu '2n B' el 2024/2025 i '3r B' el 2025/2026
--     · El panel admin mostra 3 grups en 2024/2025 i 5 grups en 2025/2026
--
-- PROFESSORS NOUS (password: profesor1234 per a tots):
--   carles.rio@escolaamadeu.cat   → Carles Riom   (Educació Física avançada)
--   neus.font@escolaamadeu.cat    → Neus Font      (Música i Arts)
--   lluc.valls@escolaamadeu.cat   → Lluc Valls     (Ciències i Tecnologia)
--   silvia.pons@escolaamadeu.cat  → Sílvia Pons    (Llengua i Socials)
--
-- INSTRUCCIONS:
--   1. Executa primer 001_add_any_escolar.sql i 002_dades_prova.sql
--   2. Llavors executa aquest fitxer
--   3. (Opcional) Executa node resetPasswordsProva.js per confirmar passwords
-- =============================================================================

USE escola_amadeu_vives;

-- =============================================================================
-- BLOC 1: 4 PROFESSORS NOUS
-- IDs: 30–33 (no col·lisionen amb els existents 21–24)
-- Hashes bcrypt pre-computats per a 'profesor1234'
-- =============================================================================

INSERT IGNORE INTO USUARI (id_usuari, nom_usuari, email, password, rol) VALUES
  (30, 'Carles Riom',   'carles.rio@escolaamadeu.cat',
   '$2b$10$yw5Ehfvnf22FGM1EG/m73epDy/Di0MZDo4wVkpkoB5YCiGbkgcLVC',  'profesor'),
  (31, 'Neus Font',     'neus.font@escolaamadeu.cat',
   '$2b$10$LOIstONQxUoEk2eJhECK6uoM5mLA/uYmmKHfT8ikMBEbCjPYQz6bq',  'profesor'),
  (32, 'Lluc Valls',    'lluc.valls@escolaamadeu.cat',
   '$2b$10$/pXzL9HqlccCGNVz5rfc5eVF6tM7K1HaSIkW93FmC7SUHLARwMeq6', 'profesor'),
  (33, 'Sílvia Pons',   'silvia.pons@escolaamadeu.cat',
   '$2b$10$031iABGRa2H2.qXh9x/tLetlLQcfufvUKkdcbc/P8Q35VtMO.8fZe',  'profesor');

INSERT IGNORE INTO PROFESOR (id_profesor, id_usuari, especialitat) VALUES
  (5, 30, 'Educació Física i Esport Escolar'),
  (6, 31, 'Música i Educació Artística'),
  (7, 32, 'Ciències Naturals i Tecnologia'),
  (8, 33, 'Llengua Catalana i Ciències Socials');


-- =============================================================================
-- BLOC 2: NOUS GRUPS (exclusius de 2025/2026)
-- 2n A  → grup dels alumnes de 1r A que han pujat de curs
-- 3r B  → grup dels alumnes de 2n B que han pujat de curs
-- Tutors: professors nous per demostrar la rotació de personal
-- =============================================================================

INSERT IGNORE INTO GRUPS_CLASSE (nom, any_escolar, curs, etapa, any_academic, id_tutor) VALUES
  ('2n A', '2025/2026', '2n de Primària', 'Primària', '2025/2026', 8),  -- Sílvia Pons tutora de 2n A (Joan i Laia aquí)
  ('3r B', '2025/2026', '3r de Primària', 'Primària', '2025/2026', 7); -- Lluc Valls tutor de 3r B  (Marc aquí)


-- =============================================================================
-- BLOC 3: ASSIGNATURES NOVES (per als nous grups)
-- =============================================================================

INSERT IGNORE INTO ASIGNATURA (id_asignatura, nom_asignatura, color_calendari) VALUES
  (11, 'Educació Emocional',  '#7b1fa2'),  -- violeta fosc
  (12, 'Robòtica Educativa',  '#00838f'),  -- cian fosc
  (13, 'Llengua Castellana',  '#f57f17');  -- groc fosc


-- =============================================================================
-- BLOC 4: ALUMNES — correccions any_escolar
-- Joan i Laia pugen a 2n A · Marc puja a 3r B (grups que ara existeixen)
-- Les files 4, 5 i 6 d'ALUMNE han de tenir els grups correctes.
-- Fem un UPDATE per si el 002 ja va inserir files sense el grup correcte.
-- =============================================================================

-- Si el 002 ja va inserir les files, actualitzem per assegurar grups correctes
UPDATE ALUMNE SET grup = '2n A', curs = '2n de Primària'
  WHERE id_usuari = 25 AND any_escolar = '2025/2026';   -- Joan → 2n A

UPDATE ALUMNE SET grup = '2n A', curs = '2n de Primària'
  WHERE id_usuari = 26 AND any_escolar = '2025/2026';   -- Laia → 2n A

UPDATE ALUMNE SET grup = '3r B', curs = '3r de Primària'
  WHERE id_usuari = 27 AND any_escolar = '2025/2026';   -- Marc → 3r B

-- Si el 002 NO va inserir les files (IGNORE), inserim ara
INSERT IGNORE INTO ALUMNE (id_alumne, id_usuari, grup, curs, any_escolar) VALUES
  (4, 25, '2n A', '2n de Primària', '2025/2026'),
  (5, 26, '2n A', '2n de Primària', '2025/2026'),
  (6, 27, '3r B', '3r de Primària', '2025/2026');

-- Vincles familiars per a 2025/2026 (002 ja els insereix; INSERT IGNORE no fa res si existeixen)
-- parentesc és ENUM('pare','mare','tutor_legal') — NO 'Pare/Mare'!
INSERT IGNORE INTO FAMILIA_ALUMNE (id_familia, id_alumne, parentesc) VALUES
  (28, 4, 'pare'),   -- Família Fernàndez → Joan (2025/2026)
  (29, 5, 'pare');   -- Família Garcia    → Laia (2025/2026)


-- =============================================================================
-- BLOC 5: HORARI LECTIU — 2n A (2025/2026)
-- Tutora: Sílvia Pons (id_profesor=8) — nou professor!
-- Diferent distribució d'assignatures respecte a 1r A
-- =============================================================================

-- Evitem duplicats si s'executa dues vegades
DELETE FROM HORARI_LECTIU WHERE grup = '2n A' AND any_escolar = '2025/2026';

INSERT INTO HORARI_LECTIU
  (dia_semana, hora_inici, hora_fi, id_asignatura, id_profesor, id_aula, grup, any_escolar)
VALUES
  -- DILLUNS — Sílvia lidera Llengua + Socials; Lluc porta Ciències
  ('Dilluns',   '08:00:00','09:00:00', 13, 8, 2, '2n A', '2025/2026'),  -- Sílvia: Castellà (nova franja 8h!)
  ('Dilluns',   '09:00:00','10:00:00',  2, 8, 2, '2n A', '2025/2026'),  -- Sílvia: Llengua Cat.
  ('Dilluns',   '10:00:00','11:00:00',  1, 1, 2, '2n A', '2025/2026'),  -- Marta:  Matemàtiques
  ('Dilluns',   '11:00:00','12:00:00',  4, 7, 7, '2n A', '2025/2026'),  -- Lluc:   Ciències Nat.
  ('Dilluns',   '15:00:00','16:00:00',  5, 8, 2, '2n A', '2025/2026'),  -- Sílvia: Ciències Socials

  -- DIMARTS — Anglès + Música (professors nous: Neus per Música)
  ('Dimarts',   '09:00:00','10:00:00',  1, 1, 2, '2n A', '2025/2026'),  -- Marta:  Matemàtiques
  ('Dimarts',   '10:00:00','11:00:00',  3, 3, 2, '2n A', '2025/2026'),  -- Anna:   Anglès
  ('Dimarts',   '11:00:00','12:00:00',  7, 6, 5, '2n A', '2025/2026'),  -- Neus:   Música (prof nova!)
  ('Dimarts',   '12:00:00','13:00:00', 13, 8, 2, '2n A', '2025/2026'),  -- Sílvia: Castellà
  ('Dimarts',   '15:00:00','16:00:00', 12, 7, 4, '2n A', '2025/2026'),  -- Lluc:   Robòtica (nova!)

  -- DIMECRES — Educació Emocional (nova assign.) + Ed.Física amb Carles (nou!)
  ('Dimecres',  '09:00:00','10:00:00', 11, 6, 2, '2n A', '2025/2026'),  -- Neus:   Ed. Emocional (nova!)
  ('Dimecres',  '10:00:00','11:00:00',  2, 8, 2, '2n A', '2025/2026'),  -- Sílvia: Llengua Cat.
  ('Dimecres',  '11:00:00','12:00:00',  6, 5, 6, '2n A', '2025/2026'),  -- Carles: Ed. Física (prof nou!)
  ('Dimecres',  '12:00:00','13:00:00',  9, 6, 8, '2n A', '2025/2026'),  -- Neus:   Plàstica/Arts

  -- DIJOUS
  ('Dijous',    '09:00:00','10:00:00',  1, 1, 2, '2n A', '2025/2026'),  -- Marta:  Matemàtiques
  ('Dijous',    '10:00:00','11:00:00',  4, 7, 7, '2n A', '2025/2026'),  -- Lluc:   Ciències Nat.
  ('Dijous',    '11:00:00','12:00:00',  2, 8, 2, '2n A', '2025/2026'),  -- Sílvia: Llengua Cat.
  ('Dijous',    '12:00:00','13:00:00',  6, 5, 6, '2n A', '2025/2026'),  -- Carles: Ed. Física

  -- DIVENDRES
  ('Divendres', '09:00:00','10:00:00',  3, 3, 2, '2n A', '2025/2026'),  -- Anna:   Anglès
  ('Divendres', '10:00:00','11:00:00',  1, 1, 2, '2n A', '2025/2026'),  -- Marta:  Matemàtiques
  ('Divendres', '11:00:00','12:00:00', 10, 8, 2, '2n A', '2025/2026'),  -- Sílvia: Valors Ètics
  ('Divendres', '12:00:00','13:00:00',  7, 6, 5, '2n A', '2025/2026');  -- Neus:   Música


-- =============================================================================
-- BLOC 6: HORARI LECTIU — 3r B (2025/2026)
-- Tutor: Lluc Valls (id_profesor=7) — nou professor!
-- Horari més avançat (3r curs): Robòtica + Castellà + més ciències
-- =============================================================================

DELETE FROM HORARI_LECTIU WHERE grup = '3r B' AND any_escolar = '2025/2026';

INSERT INTO HORARI_LECTIU
  (dia_semana, hora_inici, hora_fi, id_asignatura, id_profesor, id_aula, grup, any_escolar)
VALUES
  -- DILLUNS
  ('Dilluns',   '08:00:00','09:00:00',  1, 1, 3, '3r B', '2025/2026'),  -- Marta:  Matemàtiques (8h)
  ('Dilluns',   '09:00:00','10:00:00',  4, 7, 7, '3r B', '2025/2026'),  -- Lluc:   Ciències Nat.
  ('Dilluns',   '10:00:00','11:00:00', 13, 8, 3, '3r B', '2025/2026'),  -- Sílvia: Castellà
  ('Dilluns',   '11:00:00','12:00:00',  2, 8, 3, '3r B', '2025/2026'),  -- Sílvia: Llengua Cat.
  ('Dilluns',   '15:00:00','16:00:00',  6, 5, 6, '3r B', '2025/2026'),  -- Carles: Ed. Física

  -- DIMARTS
  ('Dimarts',   '09:00:00','10:00:00', 12, 7, 4, '3r B', '2025/2026'),  -- Lluc:   Robòtica Educativa!
  ('Dimarts',   '10:00:00','11:00:00',  1, 1, 3, '3r B', '2025/2026'),  -- Marta:  Matemàtiques
  ('Dimarts',   '11:00:00','12:00:00',  3, 3, 3, '3r B', '2025/2026'),  -- Anna:   Anglès
  ('Dimarts',   '12:00:00','13:00:00',  5, 8, 3, '3r B', '2025/2026'),  -- Sílvia: Ciències Socials
  ('Dimarts',   '15:00:00','16:00:00',  7, 6, 5, '3r B', '2025/2026'),  -- Neus:   Música

  -- DIMECRES
  ('Dimecres',  '09:00:00','10:00:00',  1, 1, 3, '3r B', '2025/2026'),  -- Marta:  Matemàtiques
  ('Dimecres',  '10:00:00','11:00:00', 11, 6, 3, '3r B', '2025/2026'),  -- Neus:   Ed. Emocional
  ('Dimecres',  '11:00:00','12:00:00',  2, 8, 3, '3r B', '2025/2026'),  -- Sílvia: Llengua Cat.
  ('Dimecres',  '12:00:00','13:00:00',  4, 7, 7, '3r B', '2025/2026'),  -- Lluc:   Ciències Nat.

  -- DIJOUS
  ('Dijous',    '09:00:00','10:00:00',  3, 3, 3, '3r B', '2025/2026'),  -- Anna:   Anglès
  ('Dijous',    '10:00:00','11:00:00', 12, 7, 4, '3r B', '2025/2026'),  -- Lluc:   Robòtica
  ('Dijous',    '11:00:00','12:00:00', 13, 8, 3, '3r B', '2025/2026'),  -- Sílvia: Castellà
  ('Dijous',    '12:00:00','13:00:00',  6, 5, 6, '3r B', '2025/2026'),  -- Carles: Ed. Física

  -- DIVENDRES
  ('Divendres', '09:00:00','10:00:00',  1, 1, 3, '3r B', '2025/2026'),  -- Marta:  Matemàtiques
  ('Divendres', '10:00:00','11:00:00',  9, 6, 8, '3r B', '2025/2026'),  -- Neus:   Plàstica/Arts
  ('Divendres', '11:00:00','12:00:00',  2, 8, 3, '3r B', '2025/2026'),  -- Sílvia: Llengua Cat.
  ('Divendres', '12:00:00','13:00:00', 10, 8, 3, '3r B', '2025/2026');  -- Sílvia: Valors Ètics


-- =============================================================================
-- BLOC 7: ACTIVITATS EXTRAESCOLARS AMPLIADES
-- Afegim activitats que impliquen els nous professors
-- =============================================================================

-- 2024/2025 — dues activitats noves amb professors nous
INSERT IGNORE INTO ACTIVITAT_EXTRAESCOLAR
  (nom, dia_semana, hora_inici, hora_fi, id_aula, responsable, places_maximes, any_escolar)
VALUES
  ('Club de Ciències',    'Dimecres', '16:00:00','17:00:00', 7,  'Lluc Valls',   10, '2024/2025'),
  ('Taller d''Arts',      'Divendres','16:00:00','17:00:00', 8,  'Neus Font',    16, '2024/2025');

-- 2025/2026 — quatre activitats noves amb professors nous
INSERT IGNORE INTO ACTIVITAT_EXTRAESCOLAR
  (nom, dia_semana, hora_inici, hora_fi, id_aula, responsable, places_maximes, any_escolar)
VALUES
  ('Robòtica Avançada',   'Dilluns',  '17:00:00','18:00:00', 4,  'Lluc Valls',   10, '2025/2026'),
  ('Taller d''Arts',      'Dimecres', '16:00:00','17:00:00', 8,  'Neus Font',    16, '2025/2026'),
  ('Atletisme',           'Dijous',   '16:00:00','17:00:00', 6,  'Carles Riom',  20, '2025/2026'),
  ('Teatre Escolar',      'Divendres','16:00:00','17:00:00', 5,  'Neus Font',    12, '2025/2026');


-- =============================================================================
-- BLOC 8: INSCRIPCIONS ALS NOUS ALUMNES EN ACTIVITATS (opcionals)
-- Demostrem que Joan (id_alumne=4) i Marc (id_alumne=6) estan inscrits
-- a activitats de 2025/2026
-- =============================================================================

-- Busquem les id_activitat dels títols que hem inserit
-- (fem servir subconsulta per robustesa)
INSERT IGNORE INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 4, id_activitat FROM ACTIVITAT_EXTRAESCOLAR
  WHERE nom = 'Robòtica Avançada' AND any_escolar = '2025/2026' LIMIT 1;

INSERT IGNORE INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 4, id_activitat FROM ACTIVITAT_EXTRAESCOLAR
  WHERE nom = 'Taller d''Arts' AND any_escolar = '2025/2026' LIMIT 1;

INSERT IGNORE INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 6, id_activitat FROM ACTIVITAT_EXTRAESCOLAR
  WHERE nom = 'Atletisme' AND any_escolar = '2025/2026' LIMIT 1;

INSERT IGNORE INTO INSCRIPCIO_ACTIVITAT (id_alumne, id_activitat)
SELECT 6, id_activitat FROM ACTIVITAT_EXTRAESCOLAR
  WHERE nom = 'Robòtica Avançada' AND any_escolar = '2025/2026' LIMIT 1;


-- =============================================================================
-- VERIFICACIÓ FINAL
-- Executa aquestes consultes per confirmar que tot s'ha inserit correctament:
-- =============================================================================
/*
-- Grups per any:
SELECT any_escolar, GROUP_CONCAT(nom ORDER BY nom) AS grups
FROM GRUPS_CLASSE GROUP BY any_escolar;

-- Horaris 2n A (2025/2026):
SELECT dia_semana, hora_inici, nom_asignatura, nom_usuari AS professor
FROM HORARI_LECTIU h
JOIN ASIGNATURA a ON h.id_asignatura = a.id_asignatura
JOIN PROFESOR p ON h.id_profesor = p.id_profesor
JOIN USUARI u ON p.id_usuari = u.id_usuari
WHERE h.grup = '2n A' AND h.any_escolar = '2025/2026'
ORDER BY FIELD(dia_semana,'Dilluns','Dimarts','Dimecres','Dijous','Divendres'), hora_inici;

-- Alumnes per any:
SELECT u.nom_usuari, a.grup, a.curs, a.any_escolar
FROM ALUMNE a JOIN USUARI u ON a.id_usuari = u.id_usuari
ORDER BY a.any_escolar, u.nom_usuari;

-- Activitats per any:
SELECT any_escolar, nom, responsable FROM ACTIVITAT_EXTRAESCOLAR ORDER BY any_escolar, nom;

-- Nous professors:
SELECT u.nom_usuari, u.email, p.especialitat
FROM PROFESOR p JOIN USUARI u ON p.id_usuari = u.id_usuari
WHERE p.id_profesor >= 5;
*/
