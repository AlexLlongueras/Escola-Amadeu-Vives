-- =============================================================================
-- Migració 001 — Afegir any_escolar a les taules principals
-- Projecte : Escola Amadeu Vives — Gestió d'Horaris i Activitats
-- Data      : 2026-05-27
-- =============================================================================
-- DESCRIPCIÓ:
--   Un any escolar va estrictament de setembre d'un any a juny del següent.
--   Format: 'AAAA/AAAA'  (ex: '2025/2026').
--   Sense aquesta columna, els horaris i activitats de cursos passats
--   es barregen amb els del curs actual i els solapaments es detecten
--   entre anys escolars (incorrecte, ja que cada any té el seu calendari).
--
-- INSTRUCCIONS:
--   Executa aquest script a MySQL Workbench:
--     File → Open SQL Script → selecciona aquest fitxer → Execute (⚡)
--   O bé copia i enganxa cada bloc al Query Editor i executa'l.
--
-- ORDRE IMPORTANT: executa els blocs en l'ordre que apareixen.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOC 1: HORARI_LECTIU
-- Els horaris lectius són 100% específics de cada any escolar.
-- El grup '1r A' del 2024/2025 pot tenir un horari completament diferent
-- al del 2025/2026 (diferent tutor, diferent aula, diferent franja...).
-- Sense this columna, el sistema detectaria solapaments entre anys
-- escolars que no existeixen en realitat.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE HORARI_LECTIU
  ADD COLUMN any_escolar VARCHAR(9) NOT NULL DEFAULT '2024/2025'
    COMMENT 'Any escolar al qual pertany aquesta franja (ex: 2025/2026). Format: AAAA/AAAA.'
  AFTER grup;

-- Índex compost per accelerar les consultes per grup+any (la més freqüent)
ALTER TABLE HORARI_LECTIU
  ADD INDEX idx_horari_grup_any (grup, any_escolar),
  ADD INDEX idx_horari_any      (any_escolar);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOC 2: ACTIVITAT_EXTRAESCOLAR
-- Les activitats extraescolars es renoven cada any:
-- poden canviar el responsable, les places, l'horari o fins i tot
-- deixar d'existir. Les inscripcions del 2024/2025 no han de
-- barrejar-se amb les del 2025/2026.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ACTIVITAT_EXTRAESCOLAR
  ADD COLUMN any_escolar VARCHAR(9) NOT NULL DEFAULT '2024/2025'
    COMMENT 'Any escolar al qual pertany aquesta activitat (ex: 2025/2026). Format: AAAA/AAAA.'
  AFTER places_maximes;

ALTER TABLE ACTIVITAT_EXTRAESCOLAR
  ADD INDEX idx_activitat_any (any_escolar);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOC 3: GRUPS_CLASSE
-- La composició dels grups i l'assignació de tutors canvia cada any.
-- El tutor del grup '1r A' el 2024/2025 pot ser diferent el 2025/2026.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE GRUPS_CLASSE
  ADD COLUMN any_escolar VARCHAR(9) NOT NULL DEFAULT '2024/2025'
    COMMENT 'Any escolar al qual pertany aquesta assignació de grup/tutor. Format: AAAA/AAAA.'
  AFTER nom;

ALTER TABLE GRUPS_CLASSE
  ADD INDEX idx_grup_any (any_escolar);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOC 4 (OPCIONAL): ALUMNE
-- El grup d'un alumne canvia cada any (passa de 1r A a 2n A, etc.).
-- Afegir any_escolar aquí permet fer un historial de la trajectòria
-- acadèmica de l'alumne. Si no interessa l'historial, es pot ometre
-- i assumir que la fila ALUMNE sempre reflecteix el curs actual.
--
-- NOTA: Si actives aquest bloc, un alumne pot tenir MÚLTIPLES files
-- a la taula ALUMNE (una per any). El backend s'ha d'adaptar
-- per filtrar sempre per any_escolar.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ALUMNE
  ADD COLUMN any_escolar VARCHAR(9) NOT NULL DEFAULT '2024/2025'
    COMMENT 'Any escolar al qual pertany l''assignació de grup d''aquest alumne. Format: AAAA/AAAA.'
  AFTER curs;

ALTER TABLE ALUMNE
  ADD INDEX idx_alumne_any (any_escolar);


-- ─────────────────────────────────────────────────────────────────────────────
-- TAULES QUE NO NECESSITEN any_escolar (justificació):
-- ─────────────────────────────────────────────────────────────────────────────
--   USUARI              → Entitat permanent. Un usuari existeix independentment
--                         de l'any escolar. El rol pot canviar però no l'entitat.
--   PROFESOR            → Entitat permanent. El professor existeix tots els anys.
--   AULA                → Recurs físic permanent. Les aules no canvien per any.
--   ASIGNATURA          → Catàleg estable. Les assignatures no es redefineixen.
--   FAMILIA_ALUMNE      → Relació biològica/legal permanent. No canvia per any.
--   INSCRIPCIO_ACTIVITAT→ Hereta l'any a través de ACTIVITAT_EXTRAESCOLAR.
--                         (Si necessites consultar inscripcions per any sense
--                          fer JOIN, pots afegir una VIEW o una columna calculada.)
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓ: comprova que les columnes s'han creat correctament
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'escola_amadeu_vives'
  AND COLUMN_NAME  = 'any_escolar'
ORDER BY TABLE_NAME;

-- Resultat esperat: 4 files (HORARI_LECTIU, ACTIVITAT_EXTRAESCOLAR,
-- GRUPS_CLASSE, ALUMNE) totes amb DEFAULT '2024/2025'.
