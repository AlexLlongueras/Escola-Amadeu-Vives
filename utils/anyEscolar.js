// utils/anyEscolar.js
// Utilitats per calcular i validar l'any escolar actual.
//
// Un any escolar va de SETEMBRE a JULIOL de l'any següent.
// Format: 'AAAA/AAAA'  (ex: '2025/2026')
//
// Lògica de càlcul (estricta):
//   Setembre – Desembre → any / any+1   (ex: oct 2025 → '2025/2026')
//   Gener    – Juliol   → any-1 / any   (ex: jul 2026 → '2025/2026', tancament del curs)
//   Agost               → any / any+1   (període de matriculació/vacances:
//                                         es considera ja preparació del curs
//                                         que comença el setembre següent)

'use strict';

/**
 * Retorna l'any escolar corresponent a una data donada.
 * Si no s'especifica data, fa servir la data actual (new Date()).
 *
 * @param {Date} [data=new Date()]
 * @returns {string}  Format 'AAAA/AAAA', ex: '2025/2026'
 *
 * @example
 * obtenirAnyEscolar(new Date('2025-10-01'))  // → '2025/2026'
 * obtenirAnyEscolar(new Date('2026-05-27'))  // → '2025/2026'
 * obtenirAnyEscolar(new Date('2026-07-15'))  // → '2025/2026' (Juliol: tancament del curs)
 * obtenirAnyEscolar(new Date('2026-08-20'))  // → '2026/2027' (Agost: matriculació curs vinent)
 * obtenirAnyEscolar(new Date('2026-09-01'))  // → '2026/2027'
 */
function obtenirAnyEscolar(data = new Date()) {
  const mes = data.getMonth() + 1; // getMonth() retorna 0-11
  const any = data.getFullYear();

  if (mes >= 9) {
    // Setembre – Desembre: ja ha començat el nou any escolar
    return `${any}/${any + 1}`;
  } else if (mes <= 7) {
    // Gener – Juliol: continuació/tancament de l'any escolar que va començar el setembre anterior
    return `${any - 1}/${any}`;
  } else {
    // Agost: període de matriculació/vacances — es considera ja part
    // del curs vinent (preparació del setembre que ve)
    return `${any}/${any + 1}`;
  }
}

/**
 * Valida que un string tingui el format correcte d'any escolar:
 * - Exactament 'AAAA/AAAA' (9 caràcters)
 * - El segon any ha de ser exactament el primer + 1
 *
 * @param {string} str
 * @returns {boolean}
 *
 * @example
 * validarAnyEscolar('2025/2026')  // → true
 * validarAnyEscolar('2025/2027')  // → false (no consecutius)
 * validarAnyEscolar('25/26')      // → false (format incorrecte)
 */
function validarAnyEscolar(str) {
  if (typeof str !== 'string') return false;
  const coincidencia = str.match(/^(\d{4})\/(\d{4})$/);
  if (!coincidencia) return false;
  const anyInici = parseInt(coincidencia[1], 10);
  const anyFi    = parseInt(coincidencia[2], 10);
  return anyFi === anyInici + 1;
}

module.exports = { obtenirAnyEscolar, validarAnyEscolar };
