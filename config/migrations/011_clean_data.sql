-- =============================================================================
-- Script 011 — Reset complet de dades
-- Projecte : Escola Amadeu Vives — Gestió d'Horaris (v2)
-- Data      : 2026-06-23
--
-- QUÈ FA:
--   Borra totes les dades de prova deixant la BD neta.
--   Manté:
--     · L'únic usuari admin (primer registre amb rol='admin' a USUARI)
--     · El curs actiu a CONFIGURACIO_CURS
--   Esborra:
--     · Tots els horaris, grups, assignatures, aules, professors
--     · Classes temporals, dies especials
--
-- INSTRUCCIONS:
--   Executa DESPRÉS de la migració 010.
--   Fes una còpia de seguretat si cal conservar dades.
-- =============================================================================

USE escola_amadeu_vives;

SET FOREIGN_KEY_CHECKS = 0;

-- Taules amb dades temporals
TRUNCATE TABLE CLASSES_TEMPORALS;
TRUNCATE TABLE HORARI_LECTIU;
TRUNCATE TABLE DIES_ESPECIALS;
TRUNCATE TABLE GRUPS_CLASSE;

-- Taules de catàleg
TRUNCATE TABLE PROFESSOR;
TRUNCATE TABLE ASIGNATURA;
TRUNCATE TABLE AULA;

-- Manté sols l'admin
DELETE FROM USUARI WHERE rol != 'admin';

-- Reinicia contadors (opcional — per tenir IDs nets)
ALTER TABLE CLASSES_TEMPORALS  AUTO_INCREMENT = 1;
ALTER TABLE HORARI_LECTIU      AUTO_INCREMENT = 1;
ALTER TABLE DIES_ESPECIALS     AUTO_INCREMENT = 1;
ALTER TABLE GRUPS_CLASSE       AUTO_INCREMENT = 1;
ALTER TABLE PROFESSOR          AUTO_INCREMENT = 1;
ALTER TABLE ASIGNATURA         AUTO_INCREMENT = 1;
ALTER TABLE AULA               AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Reset complet. BD neta i llesta per configurar.' AS resultat;
SELECT id_usuari, nom_usuari, email, rol FROM USUARI;
SELECT any_escolar, actiu FROM CONFIGURACIO_CURS WHERE actiu = 1;
