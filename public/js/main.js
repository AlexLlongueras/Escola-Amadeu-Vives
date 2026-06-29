'use strict';

const API = '';

const DIES      = ['Dilluns','Dimarts','Dimecres','Dijous','Divendres'];
const DIES_CURT = ['DL','DT','DC','DJ','DV'];
const FRANGES   = [
  '08:00','09:00','10:00','11:00','12:00',
  '13:00','15:00','16:00','17:00'
];

// ─── Elements DOM ─────────────────────────────────────────────────────────────
const pantallaLogin     = document.getElementById('pantalla-login');
const pantallaDashboard = document.getElementById('pantalla-dashboard');
const inputEmail        = document.getElementById('input-email');
const inputPassword     = document.getElementById('input-password');
const btnLogin          = document.getElementById('btn-login');
const loginError        = document.getElementById('login-error');
const btnLogout         = document.getElementById('btn-logout');
const navNom            = document.getElementById('nav-nom');
const navRol            = document.getElementById('nav-rol');
const calendariGrid     = document.getElementById('calendari-grid');

// ─── Sessió ───────────────────────────────────────────────────────────────────
const guardarSessio = (token, usuari) => {
  localStorage.setItem('token',  token);
  localStorage.setItem('usuari', JSON.stringify(usuari));
};
const obtenirToken  = () => localStorage.getItem('token');
const obtenirUsuari = () => {
  const u = localStorage.getItem('usuari');
  return u ? JSON.parse(u) : null;
};
const tancarSessio  = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('usuari');
};

// ══════════════════════════════════════════════════════════════════════════════
// ANY ESCOLAR — lògica mirall del backend (utils/anyEscolar.js)
// Permet que el frontend calculi el curs actual sense dependre d'una crida API.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calcula el curs escolar per a una data donada.
 * Setembre–Desembre → any/any+1   (ex: oct 2025 → '2025/2026')
 * Gener–Juliol      → any-1/any   (ex: jul 2026 → '2025/2026', tancament del curs)
 * Agost             → any/any+1   (matriculació/vacances — preparació del curs que ve)
 *
 * @param {Date} [data=new Date()]
 * @returns {string}  Ex: '2025/2026'
 */
function obtenirAnyEscolarActual(data = new Date()) {
  const mes = data.getMonth() + 1; // 1=gen … 12=des
  const any = data.getFullYear();
  if (mes >= 9)  return `${any}/${any + 1}`;
  if (mes <= 7)  return `${any - 1}/${any}`;
  return `${any}/${any + 1}`; // agost
}

/**
 * Genera la llista de cursos escolars disponibles al selector:
 * el curs anterior, el curs actual i el curs que ve.
 *
 * @returns {string[]}  Ex: ['2024/2025', '2025/2026', '2026/2027']
 */
function generarAnysEscolars() {
  const actual    = obtenirAnyEscolarActual();
  const anyInici  = parseInt(actual.split('/')[0], 10);
  return [
    `${anyInici - 1}/${anyInici}`,       // curs passat
    `${anyInici}/${anyInici + 1}`,       // curs actual  ← seleccionat per defecte
    `${anyInici + 1}/${anyInici + 2}`,   // curs vinent
  ];
}

/**
 * Llegeix el valor actual del selector de curs.
 * Si el selector no existeix o no té valor, retorna el curs actual calculat.
 *
 * @returns {string}  Ex: '2025/2026'
 */
function obtenirAnySeleccionat() {
  const sel = document.getElementById('selector-any-escolar');
  return (sel && sel.value) ? sel.value : obtenirAnyEscolarActual();
}

/**
 * Inicialitza el selector de curs a la navbar:
 * - Pobla les opcions (curs-1, curs actual, curs+1)
 * - Selecciona el curs actual per defecte
 * - Afegeix el listener de canvi que refresca horaris i activitats
 *
 * S'invoca des de iniciarDashboard() just després del login.
 */
function inicialitzarSelectorAny() {
  const sel = document.getElementById('selector-any-escolar');
  if (!sel) return;

  const anyActual = obtenirAnyEscolarActual();
  const anys      = generarAnysEscolars();

  // Poblem les opcions
  sel.innerHTML = '';
  anys.forEach(any => {
    const opt       = document.createElement('option');
    opt.value       = any;
    opt.textContent = `Curs ${any}`;
    opt.selected    = (any === anyActual);
    sel.appendChild(opt);
  });

  sel.style.display = 'inline-block';

  // ── Listener de canvi de curs ──────────────────────────────────────────────
  sel.addEventListener('change', () => {
    // Si la setmana mostrada queda fora del nou curs (1 set – 31 jul),
    // la desplacem a l'extrem més proper i actualitzem les fletxes.
    ajustarSetmanaAlCursSeleccionat();
    actualitzarLabelSetmana();

    const usuari = obtenirUsuari();

    // ── Admin: recarregar la llista de grups per al nou any ───────────────────
    if (usuari?.rol === 'admin') {
      carregarGrupsAdmin();
      calendariGrid.innerHTML =
        '<p class="missatge-buit">Selecciona un grup per veure l\'horari.</p>';
      return; // l'admin ha de triar grup manualment
    }

    // ── Família: recarregar els fills per al nou any ABANS de l'horari ────────
    // Cada curs un alumne pot estar en un grup diferent (Joan: 1r A → 2n A).
    // Cal tornar a consultar l'API perquè el selector mostri el grup correcte.
    if (usuari?.rol === 'familia') {
      carregarFillsIHorari(); // internament passa el nou any_escolar i crida carregarHorari
      const activitatsPane = document.getElementById('activitats');
      if (activitatsPane && activitatsPane.classList.contains('show')) {
        carregarActivitats();
      }
      return;
    }

    // ── Professor: reset al selector de tutoria i recarregar horari personal ──
    // Si estava en vista tutoria del curs anterior, tornem a la vista personal
    // perquè els grups tutoritzats poden haver canviat al nou any.
    if (usuari?.rol === 'profesor') {
      const selProf = document.getElementById('selector-profesor');
      if (selProf) {
        selProf.innerHTML    = '<option value="personal">La meva feina</option>';
        selProf.value        = 'personal';
        selProf.style.display = 'none';
      }
    }

    // ── Alumne i professor: recarregar horari directament ─────────────────────
    calendariGrid.innerHTML = '';
    carregarHorari();

    const activitatsPane = document.getElementById('activitats');
    if (activitatsPane && activitatsPane.classList.contains('show')) {
      carregarActivitats();
    }
  });
}

// ─── Login ────────────────────────────────────────────────────────────────────
btnLogin.addEventListener('click', async () => {
  const email    = inputEmail.value.trim();
  const password = inputPassword.value;
  loginError.textContent = '';

  if (!email || !password) {
    loginError.textContent = 'Omple els dos camps.';
    return;
  }

  Spinner.activar(btnLogin, 'Entrant...');
  try {
    const res   = await fetch(`${API}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const dades = await res.json();
    if (!res.ok) {
      loginError.textContent = dades.error || 'Credencials incorrectes.';
      return;
    }
    guardarSessio(dades.token, dades.usuari);
    iniciarDashboard(dades.usuari);
  } catch {
    loginError.textContent = 'No s\'ha pogut connectar amb el servidor.';
  } finally {
    Spinner.desactivar(btnLogin);
  }
});

inputPassword.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnLogin.click();
});

// ─── Logout ───────────────────────────────────────────────────────────────────
btnLogout.addEventListener('click', () => {
  tancarSessio();
  setmanaOffset = 0;

  // ── Selector global de curs ───────────────────────────────────────────────
  const selAny = document.getElementById('selector-any-escolar');
  if (selAny) { selAny.innerHTML = ''; selAny.style.display = 'none'; }

  // ── Selector de grup (admin) ──────────────────────────────────────────────
  const selGrup = document.getElementById('selector-grup');
  if (selGrup) { selGrup.innerHTML = ''; selGrup.style.display = 'none'; }

  // ── Selector de fill (família) ────────────────────────────────────────────
  const selFill = document.getElementById('selector-fill');
  if (selFill) { selFill.innerHTML = ''; selFill.style.display = 'none'; }

  // ── Selector de tutoria (professor) ──────────────────────────────────────
  // El guard listenerAdded es neteja perquè el nou login de professor
  // necessita afegir el listener a un element potencialment diferent.
  const selProf = document.getElementById('selector-profesor');
  if (selProf) {
    selProf.innerHTML    = '';
    selProf.style.display = 'none';
    delete selProf.dataset.listenerAdded;
  }

  // ── Pestanya d'activitats (alumne / família) ──────────────────────────────
  const liActs = document.getElementById('li-tab-activitats');
  if (liActs) liActs.style.display = 'none';

  // ── Botó d'accés al panell d'administrador ────────────────────────────────
  const linkAdmin = document.getElementById('link-admin');
  if (linkAdmin) linkAdmin.style.display = 'none';

  // ── Calendari i títol ────────────────────────────────────────────────────
  calendariGrid.innerHTML = '';
  const titol = document.getElementById('titol-calendari');
  if (titol) titol.textContent = 'Calendari';

  // ── Tornar a la pantalla de login ─────────────────────────────────────────
  pantallaDashboard.style.display = 'none';
  pantallaLogin.style.display     = 'flex';
  inputPassword.value             = '';
  loginError.textContent          = '';
});

// ─── Navegació setmanes ───────────────────────────────────────────────────────
let setmanaOffset = 0;

function obtenirDilluns(offset = 0) {
  const avui    = new Date();
  const dia     = avui.getDay();
  const diff    = avui.getDate() - (dia === 0 ? 6 : dia - 1);
  const dilluns = new Date(avui);
  dilluns.setDate(diff + offset * 7);
  return dilluns;
}

function formatData(d) {
  return d.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short' });
}

// ─── Límits de navegació: 1 de setembre – 31 de juliol del curs seleccionat ───
/**
 * Retorna les dates d'inici (1 setembre) i fi (31 juliol) del curs escolar
 * indicat, a mitjanit, per poder comparar-les amb el dilluns/divendres
 * de la setmana mostrada.
 *
 * @param {string} any_escolar  Ex: '2025/2026'
 */
function obtenirLimitsAnyEscolar(any_escolar) {
  const [anyInici, anyFi] = any_escolar.split('/').map(Number);
  const dataInici = new Date(anyInici, 8, 1);  // 1 de setembre
  const dataFi    = new Date(anyFi, 6, 31);    // 31 de juliol
  dataInici.setHours(0, 0, 0, 0);
  dataFi.setHours(0, 0, 0, 0);
  return { dataInici, dataFi };
}

/**
 * Comprova si la setmana corresponent a `offset` cau (totalment o
 * parcialment) dins del curs escolar seleccionat al menú global.
 */
function setmanaDinsLimits(offset) {
  const { dataInici, dataFi } = obtenirLimitsAnyEscolar(obtenirAnySeleccionat());
  const dilluns = obtenirDilluns(offset);
  dilluns.setHours(0, 0, 0, 0);
  const divendres = new Date(dilluns);
  divendres.setDate(dilluns.getDate() + 4);
  return divendres >= dataInici && dilluns <= dataFi;
}

/**
 * Activa/desactiva les fletxes de navegació segons si la setmana
 * anterior/següent encara cau dins del curs escolar seleccionat.
 */
function actualitzarBotonsSetmana() {
  document.getElementById('btn-anterior').disabled = !setmanaDinsLimits(setmanaOffset - 1);
  document.getElementById('btn-seguent').disabled  = !setmanaDinsLimits(setmanaOffset + 1);
}

/**
 * Si la setmana actualment mostrada (setmanaOffset) queda fora del curs
 * escolar seleccionat (p. ex. en canviar de curs al selector), la desplaça
 * a la setmana de l'1 de setembre o del 31 de juliol més properes.
 */
function ajustarSetmanaAlCursSeleccionat() {
  if (setmanaDinsLimits(setmanaOffset)) return;

  const { dataInici, dataFi } = obtenirLimitsAnyEscolar(obtenirAnySeleccionat());
  const dilluns0 = obtenirDilluns(0);
  dilluns0.setHours(0, 0, 0, 0);

  const msPerSetmana = 1000 * 60 * 60 * 24 * 7;
  const referencia   = dilluns0 < dataInici ? dataInici : dataFi;
  setmanaOffset = Math.round((referencia - dilluns0) / msPerSetmana);
}

function actualitzarLabelSetmana() {
  const dl = obtenirDilluns(setmanaOffset);
  const dv = new Date(dl);
  dv.setDate(dl.getDate() + 4);
  document.getElementById('label-setmana').textContent =
    `${formatData(dl)} – ${formatData(dv)}`;
  actualitzarBotonsSetmana();
}

document.getElementById('btn-anterior').addEventListener('click', () => {
  if (!setmanaDinsLimits(setmanaOffset - 1)) return;
  setmanaOffset--;
  actualitzarLabelSetmana();
  carregarHorari();
});

document.getElementById('btn-seguent').addEventListener('click', () => {
  if (!setmanaDinsLimits(setmanaOffset + 1)) return;
  setmanaOffset++;
  actualitzarLabelSetmana();
  carregarHorari();
});

// ─── Pestanya Activitats: càrrega en fer clic ─────────────────────────────────
document.getElementById('activitats-tab')
  .addEventListener('shown.bs.tab', () => {
    carregarActivitats();
  });

// ─── iniciarDashboard ─────────────────────────────────────────────────────────
function iniciarDashboard(usuari) {
  pantallaLogin.style.display     = 'none';
  pantallaDashboard.style.display = 'block';

  navNom.textContent = usuari.nom;
  navRol.textContent = usuari.rol;

  actualitzarLabelSetmana();

  // ── Inicialitzar el selector de curs (comú a tots els rols) ───────────────
  inicialitzarSelectorAny();

  // ── Botons d'accés al panell admin (només per a admins) ──────────────────
  // link-admin és ara un <div> contenidor amb 3 links (Horaris/Extraescolars/Dies)
  if (usuari.rol === 'admin') {
    const l = document.getElementById('link-admin');
    if (l) l.style.display = 'flex';
  }

  // ── Configuració específica per rol ───────────────────────────────────────
  switch (usuari.rol) {

    case 'admin': {
      document.getElementById('titol-calendari').textContent = 'Calendari per Grup';
      const selGrup = document.getElementById('selector-grup');
      selGrup.style.display = 'block';
      // Guard: evita afegir el listener més d'un cop si l'admin torna a fer login
      // sense recarregar la pàgina. El listener es manté entre sessions d'admin.
      if (!selGrup.dataset.listenerAdded) {
        selGrup.addEventListener('change', () => {
          if (!selGrup.value) return;
          calendariGrid.innerHTML = '';
          carregarHorari();
        });
        selGrup.dataset.listenerAdded = 'true';
      }
      // Carregar grups dinàmicament per al curs actual
      carregarGrupsAdmin();
      calendariGrid.innerHTML =
        '<p class="missatge-buit">Selecciona un grup per veure l\'horari.</p>';
      break;
    }

    case 'profesor':
      // El selector de tutoria es construeix dins carregarHorari
      carregarHorari();
      break;

    case 'alumne':
      document.getElementById('li-tab-activitats').style.display = 'list-item';
      carregarHorari();
      break;

    case 'familia':
      document.getElementById('li-tab-activitats').style.display = 'list-item';
      carregarFillsIHorari();
      break;
  }
}

// ─── carregarGrupsAdmin ───────────────────────────────────────────────────────
/**
 * Carrega dinàmicament els grups disponibles per al curs seleccionat
 * i els insereix al desplegable #selector-grup del dashboard de l'admin.
 * Crida a GET /api/admin/grups?any_escolar=... (endpoint exclusiu d'admin).
 *
 * @param {string|null} anyForçat  Si es passa, usa aquest any en lloc del selector.
 */
async function carregarGrupsAdmin(anyForçat = null) {
  const any = anyForçat || obtenirAnySeleccionat();
  const sel = document.getElementById('selector-grup');
  if (!sel) return;

  sel.innerHTML = '<option value="">— Carregant grups… —</option>';

  try {
    const res = await fetch(
      `${API}/api/admin/grups?any_escolar=${encodeURIComponent(any)}`,
      { headers: { 'Authorization': `Bearer ${obtenirToken()}` } }
    );

    if (!res.ok) {
      sel.innerHTML = '<option value="">— Error carregant grups —</option>';
      return;
    }

    const { grups } = await res.json();

    if (!grups || grups.length === 0) {
      sel.innerHTML = `<option value="">— Sense grups per a ${any} —</option>`;
      return;
    }

    const opts = grups.map(g => `<option value="${g}">${g}</option>`).join('');
    sel.innerHTML = `<option value="">— Selecciona un grup —</option>${opts}`;

  } catch (err) {
    console.error('Error carregant grups admin:', err.message);
    sel.innerHTML = '<option value="">— Error de connexió —</option>';
  }
}

// ─── carregarFillsIHorari (només per a família) ───────────────────────────────
/**
 * Carrega la llista de fills de la família per al curs seleccionat i
 * construeix (o reconstrueix) el selector de fills amb els grups del nou any.
 *
 * S'ha de cridar:
 *  - En l'inici del dashboard de família (login)
 *  - Quan es canvia l'any escolar al selector de la navbar
 *
 * Per cada curs, un alumne pot estar en un grup diferent (Joan: 1rA → 2nA),
 * per això s'envia ?any_escolar a l'endpoint i es reconstrueix sempre el selector.
 */
async function carregarFillsIHorari() {
  const any_escolar = obtenirAnySeleccionat();

  // Netegem l'estat anterior del selector mentre carrega
  const selFillActual = document.getElementById('selector-fill');
  if (selFillActual) selFillActual.style.display = 'none';
  calendariGrid.innerHTML = '';
  SpinnerPagina.mostrar(calendariGrid, 'Carregant fills...');

  try {
    const res = await fetch(
      `${API}/api/families/fills?any_escolar=${encodeURIComponent(any_escolar)}`,
      { headers: { 'Authorization': `Bearer ${obtenirToken()}` } }
    );
    const dades = await res.json();

    if (!res.ok) {
      // Cap fill matriculat per a aquest any escolar (curs passat sense dades, curs futur, etc.)
      calendariGrid.innerHTML = `<p class="missatge-buit">${dades.error}</p>`;
      return;
    }

    const fills = dades.fills;

    if (fills.length === 1) {
      // Un sol fill: càrrega directa sense desplegable
      const selF = document.getElementById('selector-fill');
      if (selF) selF.style.display = 'none';
      carregarHorari(fills[0].grup);
      return;
    }

    // ── Múltiples fills: reconstruïm sempre el selector ───────────────────
    // (replaceChild garanteix que no s'acumulen listeners antics)
    const selAntic = document.getElementById('selector-fill');
    const selNou   = document.createElement('select');
    selNou.id        = 'selector-fill';
    selNou.className = 'selector-grup';

    fills.forEach(f => {
      const opt       = document.createElement('option');
      opt.value       = f.grup;
      opt.textContent = `${f.nom_alumne} (${f.curs} · ${f.grup})`;
      selNou.appendChild(opt);
    });

    selAntic.parentNode.replaceChild(selNou, selAntic);
    selNou.style.display = 'block';

    // Càrrega automàtica del primer fill
    carregarHorari(fills[0].grup);

    selNou.addEventListener('change', (e) => {
      calendariGrid.innerHTML = '';
      carregarHorari(e.target.value);
    });

  } catch {
    Swal2.err('Error carregant els fills associats.');
  }
}

// ─── carregarHorari ───────────────────────────────────────────────────────────
/**
 * Carrega i pinta l'horari del rol actual.
 *
 * @param {string|null} grupDirecte  Grup passat directament (família canvia de fill).
 *                                   Si és null, el grup es llegeix del selector o el
 *                                   backend el determina pel token.
 */
async function carregarHorari(grupDirecte = null) {
  const usuari = obtenirUsuari();
  if (!usuari) return;

  calendariGrid.innerHTML = '';
  SpinnerPagina.mostrar(calendariGrid, 'Carregant horari...');

  try {
    const token      = obtenirToken();
    const params     = new URLSearchParams();

    // ── Any escolar: sempre enviat (llegit del selector de la navbar) ─────────
    params.set('any_escolar', obtenirAnySeleccionat());

    // ── Grup: depenent del rol ─────────────────────────────────────────────────
    if (grupDirecte) {
      params.set('grup', grupDirecte);

    } else if (usuari.rol === 'admin') {
      const grup = document.getElementById('selector-grup').value;
      if (!grup) {
        calendariGrid.innerHTML =
          '<p class="missatge-buit">Selecciona un grup per veure l\'horari.</p>';
        return;
      }
      params.set('grup', grup);

    } else if (usuari.rol === 'profesor') {
      const selProf = document.getElementById('selector-profesor');
      if (selProf.value && selProf.value !== 'personal') {
        params.set('grup', selProf.value);
      }
      // Si és 'personal', no passa ?grup → el backend retorna el seu horari personal

    } else if (usuari.rol === 'familia') {
      const selFill = document.getElementById('selector-fill');
      if (selFill?.value) {
        params.set('grup', selFill.value);
      }
    }
    // alumne: no passa cap ?grup → el backend detecta el grup pel token

    const url = `${API}/api/horaris?${params.toString()}`;
    console.log('carregarHorari → URL:', url);

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) { tancarSessio(); location.reload(); return; }

    const dades = await res.json();

    if (!res.ok) {
      calendariGrid.innerHTML = `<p class="missatge-buit">${dades.error}</p>`;
      return;
    }

    // ── Professor: reconstrueix el selector de tutoria cada cop que carrega ─────
    if (usuari.rol === 'profesor') {
      const sel = document.getElementById('selector-profesor');

      // ── Pas clau: guardem el valor ABANS de reconstruir les opcions ──────────
      // Sense això, el selector es reinicia sempre a "personal" després de cada
      // crida a carregarHorari, fent que el canvi de vista semblés sense efecte.
      const valorPrevi = sel.value;

      sel.innerHTML = '<option value="personal">La meva feina</option>';

      if (dades.grups_tutoritzats?.length > 0) {
        dades.grups_tutoritzats.forEach(g => {
          const opt       = document.createElement('option');
          opt.value       = g;
          opt.textContent = `La meva Tutoria: ${g}`;
          sel.appendChild(opt);
        });

        // Restaurem la selecció anterior si el valor encara és vàlid per a aquest any.
        // Si el grup tutoritzat ha canviat (any diferent), el browser torna a "personal".
        if (valorPrevi && valorPrevi !== 'personal') {
          sel.value = valorPrevi;
        }

        sel.style.display = 'block';

        // Afegim el listener una sola vegada (guard de dataset)
        if (!sel.dataset.listenerAdded) {
          sel.addEventListener('change', () => {
            calendariGrid.innerHTML = '';
            carregarHorari();
          });
          sel.dataset.listenerAdded = 'true';
        }
      } else {
        // L'any seleccionat no té cap grup tutor: amaguem i resetem a personal
        sel.value         = 'personal';
        sel.style.display = 'none';
      }
    }

    // ── Títol dinàmic ─────────────────────────────────────────────────────────
    const grupMostrar = grupDirecte || dades.grup;
    if (grupMostrar) {
      document.getElementById('titol-calendari').textContent =
        `Horari — ${grupMostrar}`;
    } else if (usuari.rol === 'profesor') {
      document.getElementById('titol-calendari').textContent = 'El meu Horari';
    }

    // ── Combina horaris lectius + activitats extraescolars ────────────────────
    let horaris    = dades.horaris || [];
    let activitats = [];

    if (usuari.rol === 'alumne' || usuari.rol === 'familia') {
      activitats = await carregarActivitatsCalendari(token);
    }

    // ── Carrega dies especials — resolució de grup per rol ───────────────────
    //
    //   Admin / Alumne / Família:
    //     Un sol grup conegut → filtre simple (centre + grup)
    //
    //   Profesor en vista personal (selector = 'personal'):
    //     Ensenyar a múltiples grups → cal passar-los tots perquè el backend
    //     retorni: events de centre + excursions de QUALSEVOL dels seus grups.
    //     Grups extrets de: horaris (grups on imparteix) + grups_tutoritzats.
    //
    //   Profesor en vista tutoria (selector = grup concret):
    //     Un sol grup → filtre simple.

    let grupPerDiesEspecials;

    if (usuari.rol === 'profesor' && !grupDirecte && !dades.grup) {
      // Vista personal del professor: recollim tots els grups dels seus horaris
      const grupsHorari  = (dades.horaris || [])
        .map(h => h.grup)
        .filter(Boolean);
      const grupsTutoria = dades.grups_tutoritzats || [];
      const grupsUnics   = [...new Set([...grupsHorari, ...grupsTutoria])];

      // Array (pot ser buit si no té classes assignades → el backend retorna centre)
      grupPerDiesEspecials = grupsUnics;

    } else {
      // Tots els altres rols: un sol grup (o null si no n'hi ha)
      grupPerDiesEspecials = grupDirecte || dades.grup || null;
    }

    const diesEspecials = await carregarDiesEspecialsCalendari(token, grupPerDiesEspecials);

    pintarCalendari([...horaris, ...activitats], diesEspecials);
    actualitzarStats(horaris);

  } catch (err) {
    console.error('Error a carregarHorari:', err);
    calendariGrid.innerHTML =
      '<p class="missatge-buit">Error carregant les dades.</p>';
  }
}

// ─── carregarActivitatsCalendari ──────────────────────────────────────────────
/**
 * Carrega les activitats extraescolars inscrites de l'alumne per al curs
 * seleccionat i les retorna en format compatible amb pintarCalendari().
 */
async function carregarActivitatsCalendari(token) {
  try {
    const any_escolar = obtenirAnySeleccionat();
    const params      = new URLSearchParams({ any_escolar });
    const res = await fetch(`${API}/api/activitats/calendari?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const dades = await res.json();
    return (dades.activitats || []).map(a => ({
      dia_semana:      a.dia_semana,
      hora_inici:      a.hora_inici,
      hora_fi:         a.hora_fi,
      nom_asignatura:  a.nom,
      color_calendari: '#6366f1',
      nom_professor:   a.responsable,
      nom_aula:        a.nom_aula || '—',
      es_extraescolar: true,
    }));
  } catch { return []; }
}

// ─── carregarDiesEspecialsCalendari ───────────────────────────────────────────
/**
 * Carrega els dies especials (festius, excursions, colònies) per al curs
 * seleccionat i els retorna per ser passats a pintarCalendari().
 *
 * @param {string}               token  JWT de la sessió
 * @param {string|string[]|null} grup
 *   · string  → un sol grup (alumne, família, admin, profe en vista tutoria)
 *   · Array   → múltiples grups (professor en vista personal: tots els seus grups)
 *   · null    → sense filtre; el backend retorna tots els events de centre
 * @returns {Promise<Array>}
 */
async function carregarDiesEspecialsCalendari(token, grup = null) {
  try {
    const params = new URLSearchParams({ any_escolar: obtenirAnySeleccionat() });

    if (Array.isArray(grup) && grup.length > 0) {
      // Professor multi-grup: envia ?grups=1r A,2n B
      params.set('grups', grup.join(','));
    } else if (typeof grup === 'string' && grup) {
      // Un sol grup
      params.set('grup', grup);
    }
    // null o array buit → no afegim cap paràmetre de grup →
    // el backend retorna els events de centre (grup IS NULL)

    const res = await fetch(`${API}/api/dies-especials?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const dades = await res.json();
    return dades.dies_especials || [];
  } catch {
    return [];
  }
}

// ─── pintarCalendari ──────────────────────────────────────────────────────────
/**
 * Pinta la graella setmanal d'horaris.
 *
 * @param {Array}  horaris       Franges lectives + activitats extraescolars
 * @param {Array}  diesEspecials Dies especials del curs (festius, excursions…)
 *                               Cada element: { nom_esdeveniment, tipus,
 *                                 data_inici: 'YYYY-MM-DD',
 *                                 data_fi:    'YYYY-MM-DD', grup }
 */
function pintarCalendari(horaris, diesEspecials = []) {
  calendariGrid.innerHTML = '';

  // ── Pre-computa la data (YYYY-MM-DD) de cada columna (DL=0 … DV=4) ────────
  const dilluns = obtenirDilluns(setmanaOffset);
  const datesCols = DIES.map((_, i) => {
    const d = new Date(dilluns);
    d.setDate(dilluns.getDate() + i);
    // Format YYYY-MM-DD en local (evita desfasament UTC)
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  });

  // Per a cada columna, troba el primer dia especial que la cobreix
  const diesPerCol = datesCols.map(dataCol =>
    diesEspecials.find(de => dataCol >= de.data_inici && dataCol <= de.data_fi) || null
  );

  // ── Capçaleres dels dies ───────────────────────────────────────────────────
  calendariGrid.appendChild(
    Object.assign(document.createElement('div'), { className: 'cap-dia' })
  );
  DIES.forEach((dia, i) => {
    const dEsp = diesPerCol[i];
    const cap  = document.createElement('div');
    cap.className = 'cap-dia' + (dEsp ? ` dia-${dEsp.tipus}` : '');
    cap.title     = dia;
    cap.innerHTML = DIES_CURT[i];
    if (dEsp) {
      cap.innerHTML +=
        `<span class="banner-especial">${dEsp.nom_esdeveniment}</span>`;
    }
    calendariGrid.appendChild(cap);
  });

  // ── Files d'hores ──────────────────────────────────────────────────────────
  FRANGES.forEach(hora => {
    calendariGrid.appendChild(
      Object.assign(document.createElement('div'), {
        className:   'etiqueta-hora',
        textContent: hora,
      })
    );

    DIES.forEach((dia, i) => {
      const dEsp = diesPerCol[i];
      const cel  = document.createElement('div');
      cel.className = 'cel-dia' + (dEsp ? ` dia-${dEsp.tipus}` : '');

      const classe = horaris.find(h =>
        h.dia_semana === dia &&
        h.hora_inici.substring(0, 5) === hora
      );

      if (classe) {
        const bloc = document.createElement('div');
        bloc.className             = 'bloc-assignatura';
        bloc.style.backgroundColor = classe.color_calendari;
        if (classe.es_extraescolar) {
          bloc.style.border = '2px dashed rgba(255,255,255,0.5)';
        }
        bloc.innerHTML = `
          <div class="nom-asig">${classe.nom_asignatura}</div>
          <div class="professor">👤 ${classe.nom_professor}</div>
          <div class="hores">
            ${classe.hora_inici.substring(0,5)} –
            ${classe.hora_fi.substring(0,5)} · ${classe.nom_aula}
          </div>`;
        cel.appendChild(bloc);
      }
      calendariGrid.appendChild(cel);
    });
  });

  if (horaris.length === 0) {
    const msg = Object.assign(document.createElement('p'), {
      className:   'missatge-buit',
      textContent: 'Cap classe registrada per a aquest grup o curs escolar.',
    });
    calendariGrid.appendChild(msg);
  }
}

// ─── actualitzarStats ─────────────────────────────────────────────────────────
function actualitzarStats(horaris) {
  document.getElementById('stat-classes').textContent =
    horaris.length;
  document.getElementById('stat-aules').textContent =
    new Set(horaris.map(h => h.nom_aula)).size;
  document.getElementById('stat-assignatures').textContent =
    new Set(horaris.map(h => h.nom_asignatura)).size;
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTIVITATS EXTRAESCOLARS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Carrega la llista completa d'activitats per al curs seleccionat
 * i les pinta al grid de cards.
 */
async function carregarActivitats() {
  const grid = document.getElementById('activitats-grid');
  SpinnerPagina.mostrar(grid, 'Carregant activitats...');
  try {
    const any_escolar = obtenirAnySeleccionat();
    const params      = new URLSearchParams({ any_escolar });
    const res = await fetch(`${API}/api/activitats?${params}`, {
      headers: { 'Authorization': `Bearer ${obtenirToken()}` },
    });
    if (res.status === 401) { tancarSessio(); location.reload(); return; }
    const dades = await res.json();
    if (!res.ok) {
      grid.innerHTML = `<p class="missatge-buit">${dades.error}</p>`;
      return;
    }
    pintarActivitats(dades.activitats);
  } catch {
    grid.innerHTML = '<p class="missatge-buit">Error carregant les activitats.</p>';
  }
}

function pintarActivitats(activitats) {
  const grid = document.getElementById('activitats-grid');
  grid.innerHTML = '';

  if (!activitats?.length) {
    grid.innerHTML = `
      <div class="col-12 text-center py-5">
        <p style="color:var(--text-clar);font-size:.95rem">
          No hi ha activitats disponibles per al curs ${obtenirAnySeleccionat()}.
        </p>
      </div>`;
    return;
  }

  const usuari        = obtenirUsuari();
  const esAlumne      = usuari?.rol === 'alumne';
  const esCursPassat  = obtenirAnySeleccionat() < obtenirAnyEscolarActual();

  const row = document.createElement('div');
  row.className = 'row g-3';

  activitats.forEach((act, idx) => {
    const pct     = Math.min(100, Math.round(
      (act.places_ocupades / act.places_maximes) * 100
    ));
    const lliures = Math.max(0, act.places_lliures);

    const colorBarra = pct >= 100 ? 'bg-danger'
                     : pct >= 70  ? 'bg-warning'
                     :              'bg-success';

    const nom  = act.nom.toLowerCase();
    const icona = nom.includes('robòt') || nom.includes('robot') ? '🤖'
                : nom.includes('bàsquet') || nom.includes('basket') ? '🏀'
                : nom.includes('futbol') ? '⚽'
                : nom.includes('música') || nom.includes('musica') ? '🎵'
                : nom.includes('teatre') ? '🎭'
                : nom.includes('reforç') || nom.includes('reforce') ? '📖'
                : nom.includes('anglès') || nom.includes('angles') ? '🇬🇧'
                : nom.includes('art') || nom.includes('pintura') ? '🎨'
                : '⭐';

    let botoHtml = '';
    if (esAlumne) {
      if (esCursPassat) {
        // Curs passat → sols consulta, no es pot inscriure
        botoHtml = `
          <button class="btn btn-tancat w-100" disabled>
            🔒 Inscripcions tancades
          </button>`;
      } else if (act.ja_inscrit) {
        botoHtml = `
          <button class="btn btn-baixa-act w-100"
                  onclick="desinscriure(${act.id_activitat}, this)">
            Donar-se de baixa
          </button>`;
      } else if (lliures <= 0) {
        botoHtml = `
          <button class="btn btn-complet w-100" disabled>
            🔒 Activitat completa
          </button>`;
      } else {
        botoHtml = `
          <button class="btn btn-inscriure-act w-100"
                  onclick="inscriure(${act.id_activitat}, this)">
            Inscriure's
            <span class="badge-places">${lliures} ${lliures === 1 ? 'plaça' : 'places'}</span>
          </button>`;
      }
    }

    const horariHtml = act.dia_semana ? `
      <div class="act-detall">
        <span class="act-icona-detall">📅</span>
        <span>${act.dia_semana} · ${act.hora_inici.substring(0,5)} – ${act.hora_fi.substring(0,5)}</span>
      </div>` : '';

    const aulaHtml = act.nom_aula ? `
      <div class="act-detall">
        <span class="act-icona-detall">🏫</span>
        <span>${act.nom_aula}</span>
      </div>` : '';

    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-lg-4';
    col.style.animationDelay = `${idx * 0.06}s`;
    col.innerHTML = `
      <div class="act-card">
        <div class="act-card-cap">
          <span class="act-emoji">${icona}</span>
          <div class="act-cap-text">
            <h3 class="act-titol">${act.nom}</h3>
            <span class="act-responsable">👤 ${act.responsable}</span>
          </div>
        </div>
        <div class="act-card-cos">
          ${horariHtml}
          ${aulaHtml}
          <div class="act-progress-wrap">
            <div class="act-progress-label">
              <span>Ocupació</span>
              <span class="act-places-text">
                <strong>${act.places_ocupades}</strong> / ${act.places_maximes} places
              </span>
            </div>
            <div class="progress act-progress-bar" role="progressbar"
                 aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
              <div class="progress-bar ${colorBarra} progress-bar-striped"
                   style="width:${pct}%; transition: width .6s ease">
              </div>
            </div>
            <div class="act-places-lliures ${lliures === 0 ? 'esgotades' : lliures <= 3 ? 'poques' : ''}">
              ${lliures === 0
                ? '🔴 Sense places disponibles'
                : lliures <= 3
                  ? `🟠 Últimes ${lliures} places!`
                  : `🟢 ${lliures} places lliures`}
            </div>
          </div>
        </div>
        ${esAlumne ? `<div class="act-card-peu">${botoHtml}</div>` : ''}
      </div>
    `;

    row.appendChild(col);
  });

  grid.appendChild(row);
}

async function inscriure(id_activitat, boto) {
  Spinner.activar(boto, 'Processant...');
  try {
    const res   = await fetch(`${API}/api/activitats/${id_activitat}/inscriure`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${obtenirToken()}` },
    });
    const dades = await res.json();
    if (res.ok) {
      boto.className = 'btn-inscriure inscrit';
      boto.innerHTML = '✓ Ja inscrit';
      boto.disabled  = true;
      Swal2.ok('Inscripció realitzada correctament!');
      carregarActivitats();
    } else {
      Spinner.desactivar(boto);
      if (dades.codi === 'SOLAPAMENT_HORARI') {
        Swal2.err(dades.detall || dades.error);
      } else if (res.status === 409) {
        Swal2.err(dades.error || 'Activitat completa. No queden places disponibles.');
      } else {
        Swal2.err(dades.error || 'Error en la inscripció.');
      }
    }
  } catch {
    Spinner.desactivar(boto);
    Swal2.err('Error de connexió amb el servidor.');
  }
}

// ─── desinscriure ──────────────────────────────────────────────────────────
/**
 * Cancel·la la inscripció de l'alumne logueat a una activitat i refresca
 * la graella de cards perquè la plaça torni a aparèixer disponible.
 */
async function desinscriure(id_activitat, boto) {
  const confirmat = await Swal2.confirmar({
    titol:        'Donar-se de baixa?',
    text:         'Deixaràs la teva plaça lliure per a un altre alumne.',
    btnConfirmar: 'Sí, donar-me de baixa',
    btnCancel:    'Cancel·lar',
  });
  if (!confirmat) return;

  Spinner.activar(boto, 'Processant...');
  try {
    const res = await fetch(`${API}/api/activitats/${id_activitat}/desinscriure`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${obtenirToken()}` },
    });
    const dades = await res.json();
    if (res.ok) {
      Swal2.ok('Baixa realitzada correctament.');
      carregarActivitats();
    } else {
      Spinner.desactivar(boto);
      Swal2.err(dades.error || 'Error en donar-se de baixa.');
    }
  } catch {
    Spinner.desactivar(boto);
    Swal2.err('Error de connexió amb el servidor.');
  }
}

// ─── Init — restaura la sessió si hi ha token guardat ─────────────────────────
(function init() {
  const token  = obtenirToken();
  const usuari = obtenirUsuari();
  if (token && usuari) iniciarDashboard(usuari);
})();
