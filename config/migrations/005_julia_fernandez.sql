-- config/migrations/005_julia_fernandez.sql
-- Afegeix Júlia Fernàndez com a segon fill de la família Fernàndez
-- per demostrar el desplegable de canvi de fill al perfil Família.
--
-- Situació prèvia:
--   família.fernandez@gmail.com (id_familia=28) tenia únicament Joan,
--   que apareixia dues vegades (una per any escolar). Amb el filtre
--   per any_escolar implementat al backend, el selector no es mostrava
--   perquè per a 2025/2026 només retornava un fill.
--
-- Solució:
--   Júlia Fernàndez és la germana de Joan, un any menor (1r de Primària).
--   Credential: julia.fernandez@escolaamadeu.cat / alumna123

-- 1. Usuari
INSERT INTO USUARI (nom_usuari, email, password, rol)
VALUES (
  'Júlia Fernàndez',
  'julia.fernandez@escolaamadeu.cat',
  '$2b$10$xPaCkL66i.LHmPICBr9PTu6lzDSxFOWWsO.n8YqQEOIBHk5t8A4HO',  -- alumna123
  'alumne'
);

-- 2. Perfil alumna 2025/2026 — grup 1r A (Joan és a 2n A)
INSERT INTO ALUMNE (id_usuari, grup, curs, any_escolar)
VALUES (LAST_INSERT_ID(), '1r A', '1r de Primària', '2025/2026');

-- 3. Vinculació familiar (la mare de Joan i Júlia és la mateixa família)
INSERT INTO FAMILIA_ALUMNE (id_familia, id_alumne, parentesc)
VALUES (28, LAST_INSERT_ID(), 'mare');
