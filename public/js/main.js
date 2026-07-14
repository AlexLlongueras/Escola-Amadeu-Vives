'use strict';

// ── Configuració ──────────────────────────────────────────────────────────────
const API    = '';
let   PX_MIN = 1.2;   // recalculat dinàmicament a cada carregarHorari
const DIA_INICI = 8 * 60;
const DIA_FI    = 20 * 60;
const TOTAL_MIN = DIA_FI - DIA_INICI;
const RE_HORA   = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Calcula PX_MIN perquè el rang complet de l'horari càpiga exactament
 * dins l'alçada disponible del contenidor .cal-scroll, sense scroll.
 * Mínim 0.7 px/min (≥21px per slot de 30 min) per mantenir llegibilitat.
 */
function calcPxMin(rangIni, rangFi) {
  const el = document.querySelector('.cal-scroll');
  if (!el) return 1.2;
  const disponible = el.clientHeight - 8;  // 8 = padding-top del .cal-scroll
  const rangeMin   = rangFi - rangIni;
  if (disponible <= 0 || rangeMin <= 0) return 1.2;
  return Math.max(0.7, disponible / rangeMin);
}

// ── Estat global ──────────────────────────────────────────────────────────────
let anyActiu       = null;
let grupActiu      = null;
let professorActiu = null;   // { id, nom } quan vistaMode === 'professor'
let vistaMode      = 'grup'; // 'grup' | 'professor'
let setmanaOffset  = 0;
let _professors    = [];
let _assignatures  = [];
let _aules         = [];
let _grups         = [];
let _cursDates     = { data_inici: null, data_fi: null }; // límits temporals del curs actiu

// ── Contrast dinàmic text ─────────────────────────────────────────────────────
// Retorna '#ffffff' o '#1e293b' (fosc) segons la luminància del color de fons.
function calcContrast(hex) {
  if (!hex || hex.length < 7) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lin = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? '#1e293b' : '#ffffff';
}

// ── Sessió ────────────────────────────────────────────────────────────────────
const getToken    = () => localStorage.getItem('token');
const getUsuari   = () => { try { return JSON.parse(localStorage.getItem('usuari')); } catch { return null; } };
const clearSessio = () => { localStorage.removeItem('token'); localStorage.removeItem('usuari'); };

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(API + url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error API'), { status: res.status, data });
  return data;
}

const apiGet    = url       => apiFetch(url);
const apiPost   = (url, b)  => apiFetch(url, { method: 'POST',   body: JSON.stringify(b) });
const apiDelete = url       => apiFetch(url, { method: 'DELETE' });
const apiPut    = (url, b)  => apiFetch(url, { method: 'PUT',    body: JSON.stringify(b) });

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $   = id  => document.getElementById(id);
const msg = (id, text, type = 'ok') => {
  const el = $(id); if (!el) return;
  el.textContent = text;
  el.className   = `msg-result ${type}`;
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
$('btn-login').addEventListener('click', async () => {
  const email    = $('input-email').value.trim();
  const password = $('input-password').value;
  $('login-error').textContent = '';
  if (!email || !password) { $('login-error').textContent = 'Omple tots els camps.'; return; }
  try {
    const d = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!d) return;
    localStorage.setItem('token',  d.token);
    localStorage.setItem('usuari', JSON.stringify(d.usuari));
    iniciarApp();
  } catch (e) {
    $('login-error').textContent = e.data?.error || 'Credencials incorrectes.';
  }
});

$('input-password').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-login').click(); });

// ── LOGOUT ────────────────────────────────────────────────────────────────────
function logout() {
  clearSessio();
  $('pantalla-dashboard').style.display = 'none';
  // FIX: usar 'flex' (no 'block') per mantenir el centrat del CSS
  $('pantalla-login').style.display = 'flex';
  $('input-password').value = '';
  $('login-error').textContent = '';
}
$('btn-logout').addEventListener('click', logout);

// ── INICIAR APP ───────────────────────────────────────────────────────────────
async function iniciarApp() {
  $('pantalla-login').style.display     = 'none';
  $('pantalla-dashboard').style.display = 'block';
  const u = getUsuari();
  if (u) $('nav-nom').textContent = u.nom || '';

  await carregarCatalecs();
  await carregarSelectorAny();
  actualitzarLabelSetmana();
  actualitzarStats();

  // Poblam els selects d'hora (Nova Franja + Classes Temporals)
  ['h-inici-sel','h-fi-sel','ct-inici-sel','ct-fi-sel'].forEach(id => generarHoresSelect(id));
  vincularHoraCombo('h-inici-sel',  'h-inici');
  vincularHoraCombo('h-fi-sel',     'h-fi');
  vincularHoraCombo('ct-inici-sel', 'ct-inici');
  vincularHoraCombo('ct-fi-sel',    'ct-fi');
}

// ── CATÀLEGS ──────────────────────────────────────────────────────────────────
async function carregarCatalecs() {
  const [rP, rA, rAu] = await Promise.all([
    apiGet('/api/admin/professors'),
    apiGet('/api/admin/assignatures'),
    apiGet('/api/admin/aules'),
  ]);
  _professors   = rP?.professors   || [];
  _assignatures = rA?.assignatures || [];
  _aules        = rAu?.aules       || [];
  omplirSelectsCatalecs();
}

function omplirSelectsCatalecs() {
  omplirSelect('h-prof-titular',    _professors,   'id_professor',  'nom',            'Selecciona');
  omplirSelect('h-asignatura',      _assignatures, 'id_asignatura', 'nom_asignatura', 'Selecciona');
  omplirSelect('h-aula',            _aules,        'id_aula',       'nom_aula',       'Selecciona');
  omplirSelect('ct-professor',      _professors,   'id_professor',  'nom',            'Cap (opcional)');
  omplirSelect('ct-asignatura',     _assignatures, 'id_asignatura', 'nom_asignatura', 'Selecciona');
  omplirSelect('ct-aula',           _aules,        'id_aula',       'nom_aula',       'Cap (opcional)');
  omplirSelect('selector-professor',_professors,   'id_professor',  'nom',            '— Selecciona un professor —');
}

function omplirSelect(elId, items, valKey, labelKey, placeholder) {
  const el = $(elId); if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(i => {
    el.innerHTML += `<option value="${i[valKey]}">${i[labelKey]}</option>`;
  });
}

// ── Desplegables d'hores (intervals de 30 min) ────────────────────────────────
function generarHoresSelect(elId, horaIni = 8, horaFi = 20) {
  const el = $(elId); if (!el) return;
  el.innerHTML = '<option value="">— Hora —</option>';
  for (let h = horaIni; h <= horaFi; h++) {
    for (const m of [0, 30]) {
      if (h === horaFi && m > 0) break;
      const v = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
      el.appendChild(Object.assign(document.createElement('option'), { value: v, textContent: v }));
    }
  }
}

function vincularHoraCombo(selId, inputId) {
  const sel = $(selId);
  const inp = $(inputId);
  if (!sel || !inp) return;
  // Select → Input
  sel.addEventListener('change', () => {
    if (sel.value) { inp.value = sel.value; inp.classList.remove('error'); }
  });
  // Input → Select (si coincideix amb una opció)
  inp.addEventListener('input', () => {
    const v = inp.value.trim();
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
      sel.value = v; // si no existeix l'opció, sel.value es queda ''
    }
  });
}

async function carregarGrupsSelector() {
  const r = await apiGet(`/api/admin/grups?any_escolar=${encodeURIComponent(anyActiu)}`);
  _grups = r?.grups || [];
  const nomGrups = _grups.map(g => ({ id: g.nom, nom: g.nom }));
  omplirSelect('selector-grup',  nomGrups, 'id', 'nom', '— Selecciona un grup —');
  omplirSelect('ct-grup',        nomGrups, 'id', 'nom', 'Selecciona');
  omplirSelect('de-grup',
    [{ id: '', nom: 'Tots (global)' }, ...nomGrups],
    'id', 'nom', ''
  );
  // Multi-select de grups (Nova Franja)
  const sel = $('h-grups-form');
  if (sel) {
    sel.innerHTML = nomGrups.map(g => `<option value="${g.id}">${g.nom}</option>`).join('');
  }
}

// ── SELECTOR ANY ESCOLAR ──────────────────────────────────────────────────────
function _desarDatesCurs(cursos, anySeleccionat) {
  const curs = cursos.find(c => c.any_escolar === anySeleccionat) || cursos[0];
  if (curs) {
    _cursDates.data_inici = curs.data_inici ? isoDate(new Date(curs.data_inici)) : null;
    _cursDates.data_fi    = curs.data_fi    ? isoDate(new Date(curs.data_fi))    : null;
  }
}

async function carregarSelectorAny() {
  const r = await apiGet('/api/configuracio');
  if (!r) return;
  const sel = $('selector-any-escolar');
  sel.innerHTML = '';
  r.cursos.forEach(c => {
    const o = document.createElement('option');
    o.value = c.any_escolar;
    o.textContent = `Curs ${c.any_escolar}`;
    if (c.actiu) { anyActiu = c.any_escolar; o.selected = true; }
    sel.appendChild(o);
  });
  if (!anyActiu && r.cursos.length) anyActiu = r.cursos[0].any_escolar;
  sel.style.display = 'inline-block';

  // Guarda dates del curs actiu per als límits de navegació
  _desarDatesCurs(r.cursos, anyActiu);
  actualitzarLimitNavegacio();

  // Etiqueta curs actiu al formulari de grups
  const lbl = $('label-curs-actiu');
  if (lbl) lbl.textContent = anyActiu || '—';

  sel.addEventListener('change', async () => {
    anyActiu  = sel.value;
    grupActiu = null;
    _desarDatesCurs(r.cursos, anyActiu);
    setmanaOffset = 0;
    const lbl2 = $('label-curs-actiu');
    if (lbl2) lbl2.textContent = anyActiu || '—';
    await carregarGrupsSelector();
    pintarCalendariMessage('Selecciona un grup per veure l\'horari.');
    actualitzarStats();
    actualitzarLimitNavegacio();
  });

  await carregarGrupsSelector();
}

// ── SETMANES ──────────────────────────────────────────────────────────────────
function obtenirDilluns(offset = 0) {
  const avui = new Date();
  const dia  = avui.getDay();
  const diff = avui.getDate() - (dia === 0 ? 6 : dia - 1);
  const d    = new Date(avui);
  d.setDate(diff + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDataCurta(d) {
  return d.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short' });
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function actualitzarLabelSetmana() {
  const dl = obtenirDilluns(setmanaOffset);
  const dv = new Date(dl); dv.setDate(dl.getDate() + 4);
  $('label-setmana').textContent = `${formatDataCurta(dl)} – ${formatDataCurta(dv)}`;
  actualitzarLimitNavegacio();
}

// Habilita/deshabilita els botons de setmana en funció del rang del curs actiu.
function actualitzarLimitNavegacio() {
  const btnAnt = $('btn-anterior');
  const btnSeg = $('btn-seguent');
  if (!btnAnt || !btnSeg) return;

  const ini = _cursDates.data_inici ? new Date(_cursDates.data_inici) : null;
  const fi  = _cursDates.data_fi    ? new Date(_cursDates.data_fi)    : null;

  const dl  = obtenirDilluns(setmanaOffset);           // dilluns setmana actual
  const dv  = new Date(dl); dv.setDate(dl.getDate() + 4); // divendres setmana actual
  const dlP = obtenirDilluns(setmanaOffset - 1);       // dilluns setmana anterior

  btnAnt.disabled = ini ? dlP < ini : false;
  btnSeg.disabled = fi  ? dv >= fi  : false;
}

$('btn-anterior').addEventListener('click', () => {
  if ($('btn-anterior').disabled) return;
  setmanaOffset--;
  actualitzarLabelSetmana();
  if (vistaMode === 'professor' && professorActiu) carregarHorariProfessor(professorActiu.id);
  else if (grupActiu) carregarHorari();
});
$('btn-seguent').addEventListener('click', () => {
  if ($('btn-seguent').disabled) return;
  setmanaOffset++;
  actualitzarLabelSetmana();
  if (vistaMode === 'professor' && professorActiu) carregarHorariProfessor(professorActiu.id);
  else if (grupActiu) carregarHorari();
});

$('selector-grup').addEventListener('change', () => {
  grupActiu = $('selector-grup').value || null;
  if (grupActiu) {
    $('titol-calendari').textContent = `Horari — ${grupActiu}`;
    carregarHorari();
  } else {
    pintarCalendariMessage('Selecciona un grup per veure l\'horari.');
  }
});

$('selector-professor').addEventListener('change', () => {
  const sel = $('selector-professor');
  const id  = sel.value ? Number(sel.value) : null;
  const nom = id ? sel.options[sel.selectedIndex].text : '';
  professorActiu = id ? { id, nom } : null;
  if (professorActiu) {
    $('titol-calendari').textContent = `Horari — ${nom}`;
    carregarHorariProfessor(id);
  } else {
    pintarCalendariMessage('Selecciona un professor per veure el seu horari.');
  }
});

$('btn-vista-grup').addEventListener('click', () => canviarVista('grup'));
$('btn-vista-prof').addEventListener('click', () => canviarVista('professor'));

// ── CANVI DE VISTA (grup / professor) ─────────────────────────────────────────
function canviarVista(mode) {
  vistaMode = mode;
  const isGrup = mode === 'grup';
  $('btn-vista-grup').classList.toggle('active', isGrup);
  $('btn-vista-prof').classList.toggle('active', !isGrup);
  $('selector-grup').style.display       = isGrup ? '' : 'none';
  $('selector-professor').style.display  = isGrup ? 'none' : '';

  if (isGrup) {
    professorActiu = null;
    if (grupActiu) {
      $('titol-calendari').textContent = `Horari — ${grupActiu}`;
      carregarHorari();
    } else {
      pintarCalendariMessage('Selecciona un grup per veure l\'horari.');
    }
  } else {
    grupActiu = null;
    if (professorActiu) {
      $('titol-calendari').textContent = `Horari — ${professorActiu.nom}`;
      carregarHorariProfessor(professorActiu.id);
    } else {
      pintarCalendariMessage('Selecciona un professor per veure el seu horari.');
    }
  }
}

// ── CALENDARI ─────────────────────────────────────────────────────────────────
function pintarCalendariMessage(text) {
  $('calendari-caps').innerHTML = '';
  $('calendari-body').innerHTML = `<p class="missatge-buit">${text}</p>`;
  const ll = $('cal-llegenda');
  if (ll) ll.style.display = 'none';
  const rc = $('cal-recompte');
  if (rc) rc.style.display = 'none';
}

function minuts(hhmm) {
  const [h, m] = String(hhmm).substring(0, 5).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calcula el rang d'hores de la graella.
 * Sempre comença a les 08:00 (com a les imatges de referència).
 * El final s'adapta al darrer event, amb mínim de 17:00.
 */
function calcularRangHores(horaris, classeTemp) {
  const tots = [...horaris, ...classeTemp];
  const ini  = 8 * 60;  // sempre 08:00
  if (!tots.length) return { ini, fi: 17 * 60 };
  const maxFi = Math.max(...tots.map(h => minuts(h.hora_fi)));
  const fi    = Math.min(1440, Math.max(17 * 60, Math.ceil(maxFi / 60) * 60));
  return { ini, fi };
}

async function carregarHorari() {
  if (!grupActiu || !anyActiu) return;

  let rH, rCT, rDE;
  try {
    [rH, rCT, rDE] = await Promise.all([
      apiGet(`/api/horaris?grup=${encodeURIComponent(grupActiu)}&any_escolar=${encodeURIComponent(anyActiu)}`),
      apiGet(`/api/classes-temporals?grup=${encodeURIComponent(grupActiu)}&any_escolar=${encodeURIComponent(anyActiu)}`),
      apiGet(`/api/dies-especials?grup=${encodeURIComponent(grupActiu)}&any_escolar=${encodeURIComponent(anyActiu)}`),
    ]);
  } catch (err) {
    pintarCalendariMessage(`Error carregant l'horari: ${err.message}`);
    console.error('carregarHorari error:', err);
    return;
  }

  const horaris       = rH?.horaris  || [];
  const classeTemp    = rCT?.classes || [];
  const diesEspecials = rDE?.dies_especials || [];

  const dies      = ['Dilluns','Dimarts','Dimecres','Dijous','Divendres'];
  const disCurt   = ['DL','DT','DC','DJ','DV'];
  const dilluns   = obtenirDilluns(setmanaOffset);
  const datesCols = dies.map((_, i) => {
    const d = new Date(dilluns); d.setDate(dilluns.getDate() + i); return isoDate(d);
  });

  // Rang d'hores dinàmic (s'adapta als horaris existents)
  const { ini: rangIni, fi: rangFi } = calcularRangHores(horaris, classeTemp);
  PX_MIN = calcPxMin(rangIni, rangFi);
  document.documentElement.style.setProperty('--slot-h', (PX_MIN * 30).toFixed(2) + 'px');
  const totalMin = rangFi - rangIni;
  const alturaPx = totalMin * PX_MIN;

  // ── Capçalera (.cal-head) ──────────────────────────────────────────────────
  const caps = $('calendari-caps');
  caps.innerHTML = '<div class="cal-h-buit"></div>';
  dies.forEach((dia, i) => {
    const dataStr = datesCols[i];
    const dE  = diesEspecials.find(d => dataStr >= d.data_inici && dataStr <= d.data_fi);
    const cls = dE ? ` dia-${dE.tipus}` : '';
    caps.innerHTML += `
      <div class="cal-h-dia${cls}">
        ${disCurt[i]}
        <span class="data-sub">${dataStr.slice(5).replace('-','/')}</span>
        ${dE ? `<span class="banner-especial">${dE.nom_esdeveniment}</span>` : ''}
      </div>`;
  });

  // ── Cos (.cal-body) ────────────────────────────────────────────────────────
  const body = $('calendari-body');
  body.innerHTML = '';

  // Columna de temps
  const timeCol = document.createElement('div');
  timeCol.className    = 'cal-time-col';
  timeCol.style.height = `${alturaPx}px`;

  for (let m = 0; m <= totalMin; m += 30) {
    const top  = m * PX_MIN;
    const absM = rangIni + m;
    const hh   = Math.floor(absM / 60).toString().padStart(2, '0');
    const mm   = (absM % 60).toString().padStart(2, '0');
    const lbl  = document.createElement('div');
    lbl.className   = 'cal-time-label';
    lbl.style.top   = `${top}px`;
    lbl.textContent = `${hh}:${mm}`;
    timeCol.appendChild(lbl);
  }
  body.appendChild(timeCol);

  // 5 columnes de dies
  const colEls = [];
  dies.forEach((dia, i) => {
    const dataStr = datesCols[i];
    const dE  = diesEspecials.find(d => dataStr >= d.data_inici && dataStr <= d.data_fi);
    const cls = dE ? ` dia-${dE.tipus}` : '';

    const col = document.createElement('div');
    col.className    = `cal-dia-col${cls}`;
    col.style.height = `${alturaPx}px`;
    // Nota: les línies guia es generen via CSS background-image

    // Blocs setmanals (amb suport de desdoblamens en paral·lel)
    const horarisDia = horaris.filter(h => h.dia_semana === dia);
    const slotMap    = {};
    horarisDia.forEach(h => {
      const key = `${String(h.hora_inici).substring(0,5)}_${String(h.hora_fi).substring(0,5)}`;
      (slotMap[key] = slotMap[key] || []).push(h);
    });
    Object.values(slotMap).forEach(slot => {
      if (slot.length === 1) col.appendChild(crearBloc(slot[0], false, rangIni));
      else col.appendChild(crearGrupDesdobl(slot, false, rangIni));
    });

    // Classes temporals d'aquest dia concret
    classeTemp
      .filter(c => c.data?.slice(0, 10) === dataStr)
      .forEach(c => col.appendChild(crearBloc(c, true, rangIni)));

    body.appendChild(col);
    colEls.push(col);
  });

  // ── Línia roja de l'hora actual ────────────────────────────────────────────
  // Apareix a la columna del dia actual, només si es mostra la setmana en curs
  const ara        = new Date();
  const diaJS      = ara.getDay();          // 0=Dg, 1=Dl … 5=Dv, 6=Ds
  const minutsAra  = ara.getHours() * 60 + ara.getMinutes();

  if (setmanaOffset === 0 &&
      diaJS >= 1 && diaJS <= 5 &&
      minutsAra >= rangIni && minutsAra <= rangFi) {

    const linia = document.createElement('div');
    linia.className  = 'hora-actual';
    linia.style.top  = `${(minutsAra - rangIni) * PX_MIN}px`;
    colEls[diaJS - 1].appendChild(linia);
  }

  window._horarisActuals = horaris;
  actualitzarStats(horaris);
  mostrarRecompteHores(horaris);

  // Mostra la llegenda quan hi ha horari carregat
  const llegenda = $('cal-llegenda');
  if (llegenda) llegenda.style.display = 'flex';
}

async function carregarHorariProfessor(id_professor) {
  if (!id_professor || !anyActiu) return;

  let rH, rDE;
  try {
    [rH, rDE] = await Promise.all([
      apiGet(`/api/horaris/professor/${id_professor}?any_escolar=${encodeURIComponent(anyActiu)}`),
      apiGet(`/api/dies-especials?any_escolar=${encodeURIComponent(anyActiu)}`),
    ]);
  } catch (err) {
    pintarCalendariMessage(`Error carregant l'horari: ${err.message}`);
    console.error('carregarHorariProfessor error:', err);
    return;
  }

  const horaris       = rH?.horaris        || [];
  const diesEspecials = rDE?.dies_especials || [];

  const dies      = ['Dilluns','Dimarts','Dimecres','Dijous','Divendres'];
  const disCurt   = ['DL','DT','DC','DJ','DV'];
  const dilluns   = obtenirDilluns(setmanaOffset);
  const datesCols = dies.map((_, i) => {
    const d = new Date(dilluns); d.setDate(dilluns.getDate() + i); return isoDate(d);
  });

  const { ini: rangIni, fi: rangFi } = calcularRangHores(horaris, []);
  PX_MIN = calcPxMin(rangIni, rangFi);
  document.documentElement.style.setProperty('--slot-h', (PX_MIN * 30).toFixed(2) + 'px');
  const totalMin = rangFi - rangIni;
  const alturaPx = totalMin * PX_MIN;

  // Capçalera
  const caps = $('calendari-caps');
  caps.innerHTML = '<div class="cal-h-buit"></div>';
  dies.forEach((dia, i) => {
    const dataStr = datesCols[i];
    const dE  = diesEspecials.find(d => dataStr >= d.data_inici && dataStr <= d.data_fi);
    const cls = dE ? ` dia-${dE.tipus}` : '';
    caps.innerHTML += `
      <div class="cal-h-dia${cls}">
        ${disCurt[i]}
        <span class="data-sub">${dataStr.slice(5).replace('-','/')}</span>
        ${dE ? `<span class="banner-especial">${dE.nom_esdeveniment}</span>` : ''}
      </div>`;
  });

  // Cos
  const body = $('calendari-body');
  body.innerHTML = '';

  const timeCol = document.createElement('div');
  timeCol.className    = 'cal-time-col';
  timeCol.style.height = `${alturaPx}px`;
  for (let m = 0; m <= totalMin; m += 30) {
    const top  = m * PX_MIN;
    const absM = rangIni + m;
    const hh   = Math.floor(absM / 60).toString().padStart(2, '0');
    const mm   = (absM % 60).toString().padStart(2, '0');
    const lbl  = document.createElement('div');
    lbl.className   = 'cal-time-label';
    lbl.style.top   = `${top}px`;
    lbl.textContent = `${hh}:${mm}`;
    timeCol.appendChild(lbl);
  }
  body.appendChild(timeCol);

  const colEls = [];
  dies.forEach((dia, i) => {
    const dataStr = datesCols[i];
    const dE  = diesEspecials.find(d => dataStr >= d.data_inici && dataStr <= d.data_fi);
    const cls = dE ? ` dia-${dE.tipus}` : '';
    const col = document.createElement('div');
    col.className    = `cal-dia-col${cls}`;
    col.style.height = `${alturaPx}px`;

    const horarisDia = horaris.filter(h => h.dia_semana === dia);
    const slotMapP   = {};
    horarisDia.forEach(h => {
      const key = `${String(h.hora_inici).substring(0,5)}_${String(h.hora_fi).substring(0,5)}`;
      (slotMapP[key] = slotMapP[key] || []).push(h);
    });
    Object.values(slotMapP).forEach(slot => {
      if (slot.length === 1) col.appendChild(crearBloc(slot[0], false, rangIni, { mostrarGrup: true }));
      else col.appendChild(crearGrupDesdobl(slot, false, rangIni, { mostrarGrup: true }));
    });

    body.appendChild(col);
    colEls.push(col);
  });

  // Línia hora actual
  const ara       = new Date();
  const diaJS     = ara.getDay();
  const minutsAra = ara.getHours() * 60 + ara.getMinutes();
  if (setmanaOffset === 0 && diaJS >= 1 && diaJS <= 5 &&
      minutsAra >= rangIni && minutsAra <= rangFi) {
    const linia = document.createElement('div');
    linia.className  = 'hora-actual';
    linia.style.top  = `${(minutsAra - rangIni) * PX_MIN}px`;
    colEls[diaJS - 1].appendChild(linia);
  }

  const llegenda = $('cal-llegenda');
  if (llegenda) llegenda.style.display = 'flex';

  window._horarisActuals = horaris;
  actualitzarStats(horaris);
  mostrarRecompteHores(horaris);
}

function crearGrupDesdobl(horaris, temporal, rangIni, opts = {}) {
  const h0     = horaris[0];
  const ini    = minuts(h0.hora_inici);
  const fi     = minuts(h0.hora_fi);
  const wrap   = document.createElement('div');
  wrap.className  = 'desdoblament-wrap';
  wrap.style.top  = `${Math.max(0, (ini - rangIni) * PX_MIN)}px`;
  wrap.style.height = `${Math.max((fi - ini) * PX_MIN, 22)}px`;
  horaris.forEach(h => wrap.appendChild(crearBloc(h, temporal, rangIni, { inline: true, ...opts })));
  return wrap;
}

function crearBloc(h, temporal = false, rangIni = DIA_INICI, opts = {}) {
  const ini    = minuts(h.hora_inici);
  const fi     = minuts(h.hora_fi);
  const height = Math.max((fi - ini) * PX_MIN, 22);

  const bloc = document.createElement('div');
  bloc.className = 'bloc-assignatura' + (temporal ? ' temporal' : '') + (opts.inline ? ' inline' : '');

  if (opts.inline) {
    // top/height gestionats pel contenidor .desdoblament-wrap (flex)
  } else {
    bloc.style.top    = `${Math.max(0, (ini - rangIni) * PX_MIN)}px`;
    bloc.style.height = `${height}px`;
  }

  const bgColor = h.color_calendari || '#1565c0';
  bloc.style.backgroundColor = bgColor;
  bloc.style.color           = calcContrast(bgColor);

  const hiStr   = String(h.hora_inici).substring(0, 5);
  const hfStr   = String(h.hora_fi).substring(0, 5);
  let profStr;
  if (opts.mostrarGrup) {
    profStr = h.grup ? `<div class="bl-prof">👥 ${h.grup}</div>` : '';
  } else {
    const profs  = h.professors || [];
    const tit    = profs.find(p => p.rol === 'Titular');
    const sups   = profs.filter(p => p.rol !== 'Titular');
    const nomTit = (tit?.nom_actiu || tit?.nom || h.nom_professor || '').trim();
    if (!nomTit && !sups.length) {
      profStr = '';
    } else {
      const supTxt = sups.length
        ? ` <span class="bl-prof-sup">(${sups.map(p => `${p.nom_actiu || p.nom} – ${p.rol}`).join(', ')})</span>`
        : '';
      profStr = `<div class="bl-prof">👤 ${nomTit || '—'}${supTxt}</div>`;
    }
  }
  const aulaStr = h.nom_aula ? ` · ${h.nom_aula}` : '';

  bloc.innerHTML = `
    <div class="bl-nom">${h.nom_asignatura}</div>
    ${profStr}
    <div class="bl-hora">${hiStr} – ${hfStr}${aulaStr}</div>
    <button class="btn-del-horari" data-id="${h.id_horari || h.id_classe}"
            data-tipus="${temporal ? 'ct' : 'horari'}" title="Eliminar">✕</button>`;

  bloc.querySelector('.btn-del-horari').addEventListener('click', async e => {
    e.stopPropagation();
    const { id, tipus } = e.target.dataset;
    const ok = await Swal.fire({
      title: 'Eliminar franja?', icon: 'warning',
      showCancelButton: true, confirmButtonColor: '#ef4444',
      confirmButtonText: 'Sí, elimina', cancelButtonText: 'Cancel·la'
    });
    if (!ok.isConfirmed) return;
    try {
      await apiDelete(tipus === 'ct' ? `/api/classes-temporals/${id}` : `/api/admin/horaris/${id}`);
      bloc.remove();
      actualitzarStats();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  });

  // Clic al bloc (no al botó X) → modal de gestió de professors/substituts
  if (!temporal && h.id_horari) {
    bloc.addEventListener('click', async e => {
      if (e.target.closest('.btn-del-horari')) return;
      await mostrarDetallFranja(h);
    });
    bloc.style.cursor = 'pointer';
  }

  return bloc;
}

async function mostrarDetallFranja(h) {
  const professors = h.professors || [];
  const color      = h.color_calendari || '#1565c0';
  const tc         = calcContrast(color);
  const hiStr      = String(h.hora_inici).substring(0, 5);
  const hfStr      = String(h.hora_fi).substring(0, 5);

  const diesNom = { Dilluns:'Dilluns', Dimarts:'Dimarts', Dimecres:'Dimecres', Dijous:'Dijous', Divendres:'Divendres' };
  const diaStr  = diesNom[h.dia_semana] || h.dia_semana || '';

  const profsHtml = professors.length
    ? professors.map(p => {
        const esBaixa    = p.en_baixa === 1 || p.en_baixa === true;
        const nomMostrat = p.nom_actiu || p.nom;
        const rolCls     = p.rol === 'Titular' ? 'rol-titular' : '';
        const nomCls     = esBaixa ? 'baixa' : '';
        const subtitolBaixa = esBaixa
          ? `<span style="font-size:0.7rem;color:#dc2626;margin-left:6px">⚠ Baixa → ${nomMostrat}</span>`
          : '';
        // Aula específica del professor de suport (si difereix de la principal)
        let subtitolAula = '';
        if (p.id_aula && p.id_aula != h.id_aula) {
          const aulaProf = _aules.find(a => a.id_aula == p.id_aula);
          if (aulaProf) {
            subtitolAula = `<span style="font-size:0.7rem;color:#64748b;margin-left:6px">→ ${aulaProf.nom_aula}</span>`;
          }
        }
        return `<div class="swal-prof-item">
          <div>
            <span class="swal-prof-nom ${nomCls}">${esBaixa ? p.nom : nomMostrat}</span>${subtitolBaixa}${subtitolAula}
          </div>
          <span class="swal-prof-rol ${rolCls}">${p.rol}</span>
        </div>`;
      }).join('')
    : `<p style="color:#94a3b8;font-size:0.85rem;text-align:center">Sense professors assignats</p>`;

  const result = await Swal.fire({
    html: `
      <div class="swal-detall">
        <div class="swal-detall-capçalera" style="background:${color}">
          <div class="dl-nom" style="color:${tc}">${h.nom_asignatura}</div>
          <div class="dl-hora" style="color:${tc}">${diaStr} · ${hiStr} – ${hfStr}</div>
        </div>
        <div class="swal-info-fila">
          <span class="swal-info-label">Grup</span>
          <span>${h.grup || '—'}</span>
        </div>
        <div class="swal-info-fila">
          <span class="swal-info-label">Aula</span>
          <span>${h.nom_aula || '—'}</span>
        </div>
        <div style="margin-top:4px">
          <div class="swal-info-label" style="margin-bottom:6px">Professors</div>
          <div class="swal-profs-list">${profsHtml}</div>
        </div>
      </div>`,
    showConfirmButton: true,
    confirmButtonText: '✏️ Editar franja',
    showCloseButton:   true,
    width:             420,
    padding:           '1rem',
    customClass:       { popup: 'swal-detall-popup', confirmButton: 'swal-btn-editar' },
  });

  if (result.isConfirmed) {
    try { await editarFranja(h); }
    catch (e) { console.error('[editarFranja]', e); Swal.fire('Error', e.message || 'Error inesperat al modal d\'edició.', 'error'); }
  }
}

async function editarFranja(h) {
  const DIES           = ['Dilluns','Dimarts','Dimecres','Dijous','Divendres'];
  const ROLS_ED_SUPORT = [
    'Suport','Acollida','SIEI','SIEI+','EE',
    'Auxiliar EE','Vetlladora','TIS','Logopeda','Fisioterapeuta',
  ];
  const RE             = /^([01]\d|2[0-3]):([0-5]\d)$/;

  const hiStr = String(h.hora_inici).substring(0, 5);
  const hfStr = String(h.hora_fi).substring(0, 5);

  // ── Detectar grups germans (mateixa franja, qualsevol grup) ──────────────────
  const horarisActuals = window._horarisActuals || [];
  const selectedGrups  = new Set([h.grup]);
  horarisActuals.forEach(oh => {
    if (String(oh.id_horari) !== String(h.id_horari) &&
        oh.dia_semana === h.dia_semana &&
        String(oh.hora_inici).substring(0, 5) === hiStr &&
        String(oh.hora_fi).substring(0, 5)    === hfStr &&
        Number(oh.id_asignatura) === Number(h.id_asignatura)) {
      selectedGrups.add(oh.grup);
    }
  });

  // ── Opcions HTML ──────────────────────────────────────────────────────────────
  const asigOpts = _assignatures.map(a =>
    `<option value="${a.id_asignatura}" ${a.id_asignatura == h.id_asignatura ? 'selected' : ''}>${a.nom_asignatura}</option>`
  ).join('');
  const aulaOpts = `<option value="">— Sense aula —</option>` + _aules.map(a =>
    `<option value="${a.id_aula}" ${a.id_aula == h.id_aula ? 'selected' : ''}>${a.nom_aula}</option>`
  ).join('');
  const diaOpts  = DIES.map(d =>
    `<option value="${d}" ${d === h.dia_semana ? 'selected' : ''}>${d}</option>`
  ).join('');
  const profOpts    = _professors.map(p =>
    `<option value="${p.id_professor}">${p.nom}</option>`
  ).join('');
  const rolSupOpts  = ROLS_ED_SUPORT.map(r => `<option value="${r}">${r}</option>`).join('');
  const aulaSupBase = `<option value="">Mateixa aula</option>` + _aules.map(a =>
    `<option value="${a.id_aula}">${a.nom_aula}</option>`
  ).join('');

  // Checkboxes de grups (tots els grups disponibles, marcats els detectats)
  const grupsDisponibles = _grups.length ? _grups : [{ nom: h.grup }];
  const grupsChkHtml = grupsDisponibles.map(g =>
    `<label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer;white-space:nowrap">
      <input type="checkbox" class="ed-grup-chk" value="${g.nom}" ${selectedGrups.has(g.nom) ? 'checked' : ''}>
      ${g.nom}
    </label>`
  ).join('');

  // Professor titular i suports (precàrrega des de h.professors)
  const allProfs    = h.professors || [];
  const titularProf = allProfs.find(p => p.rol === 'Titular');
  const suportProfs = allProfs.filter(p => p.rol !== 'Titular');

  const titularOpts = _professors.map(p =>
    `<option value="${p.id_professor}" ${p.id_professor == titularProf?.id_professor ? 'selected' : ''}>${p.nom}</option>`
  ).join('');

  const suportRowsHtml = suportProfs.map(sp => {
    const po = _professors.map(p =>
      `<option value="${p.id_professor}" ${p.id_professor == sp.id_professor ? 'selected' : ''}>${p.nom}</option>`
    ).join('');
    const ao = `<option value="">Mateixa aula</option>` + _aules.map(a =>
      `<option value="${a.id_aula}" ${a.id_aula == sp.id_aula ? 'selected' : ''}>${a.nom_aula}</option>`
    ).join('');
    const ro = ROLS_ED_SUPORT.map(r =>
      `<option value="${r}" ${r === sp.rol ? 'selected' : ''}>${r}</option>`
    ).join('');
    return `<div class="ed-prof-row" style="display:flex;gap:5px;align-items:center">
      <select class="ed-prof-sel swal2-input" style="margin:0;flex:2;min-width:0"><option value="">— Professor —</option>${po}</select>
      <select class="ed-prof-aula swal2-input" style="margin:0;flex:1.5;min-width:0">${ao}</select>
      <select class="ed-prof-rol swal2-input" style="margin:0;flex:1;min-width:0">${ro}</select>
      <button type="button" class="btn-del-suport" style="background:#fee2e2;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;flex-shrink:0" title="Eliminar">✕</button>
    </div>`;
  }).join('');

  const { value: formVals, isConfirmed } = await Swal.fire({
    title:  'Editar franja',
    width:  560,
    padding:'1.2rem',
    html: `
      <div style="display:grid;gap:10px;text-align:left">
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#475569">Matèria *</label>
          <select id="ed-asig" class="swal2-input" style="margin:0;width:100%">
            <option value="">Selecciona</option>${asigOpts}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:.8rem;font-weight:600;color:#475569">Dia *</label>
            <select id="ed-dia" class="swal2-input" style="margin:0;width:100%">${diaOpts}</select>
          </div>
          <div>
            <label style="font-size:.8rem;font-weight:600;color:#475569">Aula</label>
            <select id="ed-aula" class="swal2-input" style="margin:0;width:100%">${aulaOpts}</select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:.8rem;font-weight:600;color:#475569">Hora inici *</label>
            <input id="ed-inici" type="text" class="swal2-input" style="margin:0;width:100%" placeholder="09:00" value="${hiStr}">
          </div>
          <div>
            <label style="font-size:.8rem;font-weight:600;color:#475569">Hora fi *</label>
            <input id="ed-fi" type="text" class="swal2-input" style="margin:0;width:100%" placeholder="10:00" value="${hfStr}">
          </div>
        </div>
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#475569">Grups *</label>
          <div id="ed-grups-container"
            style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:4px;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
            ${grupsChkHtml}
          </div>
        </div>
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#475569">Professor Titular *</label>
          <select id="ed-titular" class="swal2-input" style="margin:0;width:100%">
            <option value="">— Selecciona —</option>${titularOpts}
          </select>
        </div>
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#475569">Professors de suport</label>
          <div id="ed-suport-container" style="display:flex;flex-direction:column;gap:6px">${suportRowsHtml}</div>
          <button type="button" id="ed-add-suport"
            style="margin-top:6px;font-size:.78rem;background:none;border:1px dashed #94a3b8;padding:3px 10px;border-radius:4px;cursor:pointer;color:#475569">
            + Afegir suport
          </button>
        </div>
      </div>`,
    showCancelButton:  true,
    confirmButtonText: 'Desar canvis',
    cancelButtonText:  'Cancel·lar',
    didOpen: () => {
      const addBtn    = document.getElementById('ed-add-suport');
      const container = document.getElementById('ed-suport-container');

      const addDelBtn = row => row.querySelector('.btn-del-suport').addEventListener('click', () => row.remove());
      container.querySelectorAll('.ed-prof-row').forEach(addDelBtn);

      addBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className     = 'ed-prof-row';
        row.style.cssText = 'display:flex;gap:5px;align-items:center';
        row.innerHTML = `
          <select class="ed-prof-sel swal2-input" style="margin:0;flex:2;min-width:0"><option value="">— Professor —</option>${profOpts}</select>
          <select class="ed-prof-aula swal2-input" style="margin:0;flex:1.5;min-width:0">${aulaSupBase}</select>
          <select class="ed-prof-rol swal2-input" style="margin:0;flex:1;min-width:0">${rolSupOpts}</select>
          <button type="button" class="btn-del-suport" style="background:#fee2e2;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;flex-shrink:0" title="Eliminar">✕</button>`;
        addDelBtn(row);
        container.appendChild(row);
      });
    },
    preConfirm: () => {
      const asig  = document.getElementById('ed-asig').value;
      const dia   = document.getElementById('ed-dia').value;
      const aula  = document.getElementById('ed-aula').value;
      const inici = document.getElementById('ed-inici').value.trim();
      const fi    = document.getElementById('ed-fi').value.trim();
      const tit   = document.getElementById('ed-titular').value;
      const grups = Array.from(document.querySelectorAll('.ed-grup-chk:checked')).map(c => c.value);

      if (!asig)                              { Swal.showValidationMessage('La matèria és obligatòria.');          return false; }
      if (!RE.test(inici) || !RE.test(fi))    { Swal.showValidationMessage('Les hores han de ser HH:MM.');        return false; }
      if (fi <= inici)                        { Swal.showValidationMessage("L'hora fi ha de ser posterior.");      return false; }
      if (!grups.length)                      { Swal.showValidationMessage('Selecciona almenys un grup.');         return false; }
      if (!tit)                               { Swal.showValidationMessage('El Professor Titular és obligatori.'); return false; }

      const professors_suport = [];
      document.querySelectorAll('#ed-suport-container .ed-prof-row').forEach(row => {
        const ps = row.querySelector('.ed-prof-sel');
        const rs = row.querySelector('.ed-prof-rol');
        const as = row.querySelector('.ed-prof-aula');
        const idProf = ps?.value;
        if (!idProf) return;
        professors_suport.push({
          id_professor: Number(idProf),
          id_aula:      as?.value ? Number(as.value) : null,
          rol:          rs?.value || 'Suport',
        });
      });

      return { dia_semana: dia, hora_inici: inici, hora_fi: fi,
               id_asignatura: Number(asig), id_aula: aula ? Number(aula) : null,
               id_professor: Number(tit), professors_suport, grups };
    },
  });

  if (!isConfirmed || !formVals) return;

  console.log(`DADES ENVIADES AL BACKEND (PUT /api/horaris/${h.id_horari}):`, JSON.stringify(formVals, null, 2));

  try {
    await apiPut(`/api/horaris/${h.id_horari}`, formVals);
    Swal.fire({ icon: 'success', title: 'Franja actualitzada', timer: 1800, showConfirmButton: false });
    if (vistaMode === 'professor' && professorActiu?.id) {
      carregarHorariProfessor(professorActiu.id);
    } else {
      carregarHorari();
    }
  } catch (e) {
    Swal.fire('Error', e.data?.error || e.message || 'Error desconegut.', 'error');
  }
}

function actualitzarStats() {
  // Les targetes d'estadística han estat eliminades de la UI.
  // Funció mantinguda per compatibilitat amb crides existents (no fa res).
}

// ── Recompte d'hores lectius per matèria (sidebar dret del calendari) ───────
function mostrarRecompteHores(horaris) {
  const el = $('cal-recompte');
  if (!el) return;
  if (!horaris || !horaris.length) { el.style.display = 'none'; return; }

  // Deduplicar per slot (dia + hora + matèria) per no comptar desdoblamens doble
  const mapa     = {};
  const slotsSeen = new Set();
  horaris.forEach(h => {
    const slotKey = `${h.dia_semana}_${String(h.hora_inici).substring(0,5)}_${String(h.hora_fi).substring(0,5)}_${h.nom_asignatura || '?'}`;
    if (slotsSeen.has(slotKey)) return;
    slotsSeen.add(slotKey);
    const mins  = minuts(h.hora_fi) - minuts(h.hora_inici);
    const nom   = h.nom_asignatura || '?';
    const color = h.color_calendari || '#1565c0';
    if (!mapa[nom]) mapa[nom] = { mins: 0, color };
    mapa[nom].mins += mins;
  });

  el.innerHTML = Object.entries(mapa)
    .sort(([, a], [, b]) => b.mins - a.mins)
    .map(([nom, d]) => {
      const h   = Math.floor(d.mins / 60);
      const m   = d.mins % 60;
      const str = m ? `${h}h ${m}m` : `${h}h`;
      return `<span class="recompte-pill" style="border-color:${d.color}">${nom}: ${str}</span>`;
    }).join('');
  el.style.display = 'flex';
}

// ── VALIDACIÓ HORA ────────────────────────────────────────────────────────────
function validarHoraInput(elId) {
  const el  = $(elId); if (!el) return false;
  const val = el.value.trim();
  const ok  = RE_HORA.test(val);
  el.classList.toggle('error', val.length > 0 && !ok);
  return ok;
}

['h-inici','h-fi','ct-inici','ct-fi'].forEach(id => {
  const el = $(id); if (!el) return;
  el.addEventListener('input', () => validarHoraInput(id));
  el.addEventListener('blur',  () => el.value && validarHoraInput(id));
});

// ── PDF (manipulació DOM real + footer recompte + escala A4 landscape) ────────
$('btn-pdf').addEventListener('click', () => {
  const nom        = vistaMode === 'professor' ? professorActiu?.nom : grupActiu;
  const calAmb     = document.querySelector('.cal-amb-recompte');
  const calScroll  = document.querySelector('#calendari-wrapper .cal-scroll');
  const recompteEl = $('cal-recompte');

  if (!calAmb || !nom) {
    return Swal.fire('Cap horari', 'Selecciona un grup o professor primer.', 'info');
  }

  // ── Guardar tots els estats originals ─────────────────────────────────────
  const sv = {
    gridCols:   calAmb.style.gridTemplateColumns,
    calAmbH:    calAmb.style.height,
    calAmbOver: calAmb.style.overflow,
    calAmbTr:   calAmb.style.transform,
    calAmbTrO:  calAmb.style.transformOrigin,
    calAmbW:    calAmb.style.width,
    recDisplay: recompteEl ? recompteEl.style.display : null,
    scrOver:    calScroll  ? calScroll.style.overflow  : null,
    scrH:       calScroll  ? calScroll.style.height    : null,
    scrMaxH:    calScroll  ? calScroll.style.maxHeight : null,
  };

  // ── Modificar DOM: calendari full-width, sidebar ocult, scroll expandit ───
  calAmb.style.gridTemplateColumns = '1fr';
  calAmb.style.height              = 'auto';
  calAmb.style.overflow            = 'visible';
  if (recompteEl) recompteEl.style.display = 'none';
  if (calScroll) {
    calScroll.style.overflow  = 'visible';
    calScroll.style.height    = 'auto';
    calScroll.style.maxHeight = 'none';
  }

  // ── Footer horitzontal amb recompte d'hores ───────────────────────────────
  let footer = null;
  if (recompteEl && sv.recDisplay !== 'none' && recompteEl.childElementCount > 0) {
    footer = document.createElement('div');
    footer.style.cssText = [
      'display:flex', 'flex-wrap:wrap', 'gap:5px 8px',
      'padding:8px 4px 2px', 'margin-top:10px',
      'border-top:2px solid #e2e8f0', 'background:#fff',
    ].join(';');
    Array.from(recompteEl.children).forEach(p => footer.appendChild(p.cloneNode(true)));
    calAmb.appendChild(footer);
  }

  // ── Escalar si el contingut és massa alt per A4 landscape ─────────────────
  const calW = calAmb.offsetWidth  || 1050;
  const calH = calAmb.scrollHeight || 700;
  const maxH = calW * (194 / 281); // proporcions A4 landscape (281×194 mm útils)
  if (calH > maxH) {
    const scl = maxH / calH;
    calAmb.style.transform       = `scale(${scl.toFixed(5)})`;
    calAmb.style.transformOrigin = 'top left';
    calAmb.style.width           = `${(100 / scl).toFixed(3)}%`;
  }

  // ── Restauració del DOM original ──────────────────────────────────────────
  const restore = () => {
    calAmb.style.gridTemplateColumns = sv.gridCols;
    calAmb.style.height              = sv.calAmbH;
    calAmb.style.overflow            = sv.calAmbOver;
    calAmb.style.transform           = sv.calAmbTr;
    calAmb.style.transformOrigin     = sv.calAmbTrO;
    calAmb.style.width               = sv.calAmbW;
    if (recompteEl && sv.recDisplay !== null) recompteEl.style.display = sv.recDisplay;
    if (calScroll) {
      calScroll.style.overflow  = sv.scrOver  ?? '';
      calScroll.style.height    = sv.scrH     ?? '';
      calScroll.style.maxHeight = sv.scrMaxH  ?? '';
    }
    if (footer) calAmb.removeChild(footer);
  };

  // ── Generar PDF i restaurar ───────────────────────────────────────────────
  html2pdf().set({
    margin:      [8, 8, 8, 8],
    filename:    `horari-${nom}-${anyActiu || ''}.pdf`,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'landscape' },
  }).from(calAmb).save().then(restore).catch(err => { restore(); console.error('PDF:', err); });
});

// ── EXCEL (matriu dashboard — ExcelJS) ────────────────────────────────────────
$('btn-excel').addEventListener('click', async () => {
  const vista   = vistaMode === 'professor' ? professorActiu?.nom : grupActiu;
  const horaris = window._horarisActuals || [];
  if (!horaris.length || !vista) {
    return Swal.fire('Cap horari', 'Selecciona un grup o professor primer.', 'info');
  }
  if (typeof ExcelJS === 'undefined') {
    return Swal.fire('Error', 'La llibreria ExcelJS no està carregada. Comprova la connexió.', 'error');
  }

  function toMins(t) {
    const s = String(t).substring(0, 5);
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  }
  function minsToStr(m) {
    return Math.floor(m / 60).toString().padStart(2, '0') + ':' + (m % 60).toString().padStart(2, '0');
  }

  // ── Rang horari i slots de 30 min ─────────────────────────────────────────
  // Floregem rang0 al múltiple de 30 min més proper per avall, de manera que
  // hores intermèdies (p.ex. 09:15) quedin dins el primer slot (09:00).
  const rang0Raw = Math.min(...horaris.map(h => toMins(h.hora_inici)));
  const rang0    = Math.floor(rang0Raw / 30) * 30;
  const rangF    = Math.max(...horaris.map(h => toMins(h.hora_fi)));
  const slots    = [];
  for (let m = rang0; m < rangF; m += 30) slots.push(minsToStr(m));
  const slotIdx = Object.fromEntries(slots.map((s, i) => [s, i]));

  const DAY_COL = { Dilluns: 2, Dimarts: 3, Dimecres: 4, Dijous: 5, Divendres: 6 };

  // ── Fase 1: recollir dades per cel·la ────────────────────────────────────
  // key `sIdx,col` → { blocks: string[][], slotsSpanned }
  const cellData = {};
  horaris.forEach(h => {
    const col     = DAY_COL[h.dia_semana];
    if (!col) return;
    const iniMins = toMins(h.hora_inici);
    const fiMins  = toMins(h.hora_fi);
    // Floor al slot de 30 min inferior: 09:15 → slot 09:00
    const slotMins = Math.floor(iniMins / 30) * 30;
    const sIdx     = slotIdx[minsToStr(slotMins)];
    if (sIdx === undefined) return;
    const slotsSpanned = Math.max(1, Math.round((fiMins - iniMins) / 30));
    const hiStr    = minsToStr(iniMins);
    const hfStr    = minsToStr(fiMins);
    const profNoms = (h.professors || []).map(p => p.nom_actiu || p.nom).join(', ')
                     || h.nom_professor || '';
    // La franja horaria real apareix a la cel·la per classes a hores intermèdies
    const block = [h.nom_asignatura, `${hiStr} – ${hfStr}`, profNoms, h.nom_aula].filter(Boolean);
    const key   = `${sIdx},${col}`;
    if (!cellData[key]) {
      cellData[key] = { blocks: [block], slotsSpanned };
    } else {
      cellData[key].blocks.push(block);
      cellData[key].slotsSpanned = 1; // desdoblament → no es pot fusionar
    }
  });

  // ── Fase 2: construir workbook ────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Escola Amadeu Vives';
  const ws = wb.addWorksheet('Horari', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
    views:     [{ state: 'frozen', ySplit: 1 }],
  });

  // Amplades
  [8, 30, 30, 30, 30, 30].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Estils reutilitzables
  const bord = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const borders = { top: bord, bottom: bord, left: bord, right: bord };

  // ── Fila capçalera ────────────────────────────────────────────────────────
  const hRow = ws.addRow(['Hora', 'DL', 'DT', 'DC', 'DJ', 'DV']);
  hRow.height = 22;
  hRow.eachCell(cell => {
    cell.font      = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border    = { top: bord, bottom: bord, left: bord, right: bord };
  });

  // ── Files de slots (buides inicialment) ───────────────────────────────────
  slots.forEach(slot => {
    const row = ws.addRow([slot, '', '', '', '', '']);
    row.height = 55;
    const horaCell = row.getCell(1);
    horaCell.font      = { bold: true, size: 9, color: { argb: 'FF475569' } };
    horaCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    horaCell.alignment = { vertical: 'middle', horizontal: 'center' };
    horaCell.border    = borders;
    for (let c = 2; c <= 6; c++) {
      const cell     = row.getCell(c);
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border    = borders;
    }
  });

  // ── Omplir dades i merges ─────────────────────────────────────────────────
  Object.entries(cellData).forEach(([key, { blocks, slotsSpanned }]) => {
    const [sIdx, col] = key.split(',').map(Number);
    const sheetRow = sIdx + 2; // +1 header (1-based) + 1

    const cellValue = blocks.length === 1
      ? blocks[0].join('\r\n')
      : blocks.map(b => b.join('\r\n')).join('\r\n-------------------\r\n');

    if (slotsSpanned > 1 && blocks.length === 1) {
      ws.mergeCells(sheetRow, col, sheetRow + slotsSpanned - 1, col);
    }

    const cell     = ws.getCell(sheetRow, col);
    cell.value     = cellValue;
    cell.font      = { size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border    = borders;
  });

  // ── Generar fitxer i descarregar ──────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = `horari-${vista}-${anyActiu || ''}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ── CREAR HORARI ──────────────────────────────────────────────────────────────

// Afegir professor de suport dinàmicament
const ROLS_SUPORT = [
  'Suport','Acollida','SIEI','SIEI+','EE',
  'Auxiliar EE','Vetlladora','TIS','Logopeda','Fisioterapeuta',
];

$('btn-add-prof-suport').addEventListener('click', () => {
  const container = $('prof-suport-container');
  const row = document.createElement('div');
  row.className = 'prof-suport-row';
  const profOpts = _professors.map(p =>
    `<option value="${p.id_professor}">${p.nom}</option>`).join('');
  const aulaOpts = `<option value="">Mateixa aula</option>` + _aules.map(a =>
    `<option value="${a.id_aula}">${a.nom_aula}</option>`).join('');
  const rolOpts  = ROLS_SUPORT.map(r => `<option value="${r}">${r}</option>`).join('');
  row.innerHTML = `
    <select class="prof-suport-sel">
      <option value="">— Professor —</option>${profOpts}
    </select>
    <select class="prof-suport-aula">${aulaOpts}</select>
    <select class="prof-suport-rol">${rolOpts}</select>
    <button type="button" class="btn-del-suport" title="Eliminar">✕</button>`;
  row.querySelector('.btn-del-suport').addEventListener('click', () => row.remove());
  container.appendChild(row);
});

$('btn-crear-horari').addEventListener('click', async () => {
  const dia       = $('h-dia').value;
  const inici     = $('h-inici').value.trim();
  const fi        = $('h-fi').value.trim();
  const asig      = $('h-asignatura').value;
  const aula      = $('h-aula').value;
  const titular   = $('h-prof-titular').value;
  const grupsSel  = $('h-grups-form');
  const grups     = grupsSel
    ? Array.from(grupsSel.selectedOptions).map(o => o.value).filter(Boolean)
    : [];

  if (!RE_HORA.test(inici) || !RE_HORA.test(fi))
    return msg('horari-msg', 'Les hores han de ser HH:MM (ex: 09:30).', 'err');
  if (!dia || !asig)
    return msg('horari-msg', 'Dia i matèria son obligatoris.', 'err');
  if (!titular)
    return msg('horari-msg', 'El Professor Titular és obligatori.', 'err');

  if (!grups.length)
    return msg('horari-msg', 'Selecciona almenys un grup.', 'err');

  // Professor Titular + array de suports per separat
  const professors_suport = [];
  document.querySelectorAll('#prof-suport-container .prof-suport-row').forEach(row => {
    const ps = row.querySelector('.prof-suport-sel');
    const rs = row.querySelector('.prof-suport-rol');
    const as = row.querySelector('.prof-suport-aula');
    const idProf = ps?.value;
    if (!idProf) return;
    professors_suport.push({
      id_professor: Number(idProf),
      id_aula:      as?.value ? Number(as.value) : null,
      rol:          rs?.value || 'Suport',
    });
  });

  const payload = {
    dia_semana: dia, hora_inici: inici, hora_fi: fi,
    id_asignatura: Number(asig), id_aula: Number(aula),
    id_professor: Number(titular),
    professors_suport,
    grups, any_escolar: anyActiu,
  };
  console.log('DADES ENVIADES AL BACKEND (POST /api/horaris):', JSON.stringify(payload, null, 2));

  try {
    const r = await apiPost('/api/horaris', payload);
    msg('horari-msg', `✓ ${r.missatge}`, 'ok');
    // Refresca el calendari si el grup actiu és un dels creats
    if (grupActiu && grups.includes(grupActiu)) carregarHorari();
  } catch (e) {
    msg('horari-msg', e.data?.conflictes?.join(' | ') || e.message, 'err');
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PROFESSORS
// ══════════════════════════════════════════════════════════════════════════════
document.querySelector('[data-bs-target="#tab-professors"]')
  ?.addEventListener('shown.bs.tab', carregarLlistaProfessors);

async function carregarLlistaProfessors() {
  const r = await apiGet('/api/admin/professors');
  _professors = r?.professors || [];
  omplirSelectsCatalecs();

  const div = $('llista-professors');
  if (!_professors.length) {
    div.innerHTML = '<p class="text-muted small mt-2">Cap professor registrat.</p>'; return;
  }
  div.innerHTML = _professors.map(p => {
    const baixa    = p.en_baixa === 1;
    const badge    = baixa
      ? `<span class="badge-baixa">🔴 Baixa${p.nom_substitut ? ` → ${p.nom_substitut}` : ''}</span>`
      : `<span class="badge-actiu">🟢 Actiu</span>`;
    const btnBaixa = baixa
      ? `<button class="btn-baixa activa" onclick="gestionarBaixaProfessor(${p.id_professor}, true)">✅ Reincorporar</button>`
      : `<button class="btn-baixa"         onclick="gestionarBaixaProfessor(${p.id_professor}, false)">🔴 Baixa</button>`;
    return `<div class="item-row">
      <div class="item-info">
        <div class="item-nom">${p.nom} ${badge}</div>
        <div class="item-sub">${p.especialitat || '—'}</div>
      </div>
      <div class="item-actions">
        ${btnBaixa}
        <button class="btn-editar" onclick="editarProfessor(${p.id_professor},'${(p.nom||'').replace(/'/g,"\\'")}','${(p.especialitat||'').replace(/'/g,"\\'")}')">✏ Editar</button>
        <button class="btn-delete" onclick="eliminarProfessor(${p.id_professor})">🗑 Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

$('btn-crear-professor').addEventListener('click', async () => {
  const nom = $('p-nom').value.trim();
  if (!nom) return Swal.fire('Camp buit', 'El nom és obligatori.', 'warning');
  try {
    await apiPost('/api/admin/professors', {
      nom, especialitat: $('p-especialitat').value.trim()
      // email eliminat per petició del client
    });
    $('p-nom').value = ''; $('p-especialitat').value = '';
    await carregarLlistaProfessors();
    Swal.fire({ icon: 'success', title: 'Professor afegit!', timer: 1500, showConfirmButton: false });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
});

window.editarProfessor = async (id, nomActual, especialitatActual) => {
  const { value: vals } = await Swal.fire({
    title: '✏ Editar professor',
    html: `<div style="display:flex;flex-direction:column;gap:10px;text-align:left">
             <div>
               <label style="font-size:0.8rem;font-weight:600;color:#475569">Nom *</label>
               <input id="swal-p-nom" type="text" value="${nomActual}"
                 style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
             </div>
             <div>
               <label style="font-size:0.8rem;font-weight:600;color:#475569">Especialitat</label>
               <input id="swal-p-esp" type="text" value="${especialitatActual}"
                 style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
             </div>
           </div>`,
    showCancelButton:  true,
    confirmButtonText: 'Guardar',
    cancelButtonText:  'Cancel·la',
    preConfirm: () => {
      const nom = document.getElementById('swal-p-nom').value.trim();
      if (!nom) { Swal.showValidationMessage('El nom és obligatori.'); return false; }
      return { nom, especialitat: document.getElementById('swal-p-esp').value.trim() };
    },
  });
  if (!vals) return;
  try {
    await apiPut(`/api/admin/professors/${id}`, vals);
    await carregarLlistaProfessors();
    Swal.fire({ icon: 'success', title: 'Professor actualitzat!', timer: 1400, showConfirmButton: false });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

window.eliminarProfessor = async (id) => {
  const ok = await Swal.fire({ title: 'Eliminar professor?', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#ef4444',
    confirmButtonText: 'Sí, elimina', cancelButtonText: 'Cancel·la' });
  if (!ok.isConfirmed) return;
  try {
    await apiDelete(`/api/admin/professors/${id}`);
    await carregarLlistaProfessors();
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

window.gestionarBaixaProfessor = async (id, enBaixaActual) => {
  if (enBaixaActual) {
    // Reincorporar directament
    const ok = await Swal.fire({
      title: 'Reincorporar professor?',
      text: 'Es desactivarà la baixa i es retirarà el substitut assignat.',
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Sí, reincorporar', cancelButtonText: 'Cancel·la',
    });
    if (!ok.isConfirmed) return;
    try {
      await apiPut(`/api/admin/professors/${id}/baixa`, { en_baixa: false, id_substitut: null });
      await carregarLlistaProfessors();
      Swal.fire({ icon: 'success', title: 'Professor reincorporat!', timer: 1400, showConfirmButton: false });
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
    return;
  }

  // Activar baixa: triar substitut
  const profOpts = _professors
    .filter(p => p.id_professor !== id)
    .map(p => `<option value="${p.id_professor}">${p.nom}</option>`)
    .join('');

  const { value: vals } = await Swal.fire({
    title: '🔴 Activar baixa',
    html: `<p style="color:#6b7280;margin-bottom:12px;font-size:0.9rem">
             Selecciona el professor que el substituirà al calendari:
           </p>
           <select id="swal-substitut" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px">
             <option value="">— Sense substitut —</option>${profOpts}
           </select>`,
    showCancelButton:  true,
    confirmButtonText: '🔴 Activar baixa',
    confirmButtonColor: '#ef4444',
    cancelButtonText:  'Cancel·la',
    preConfirm: () => ({
      id_substitut: document.getElementById('swal-substitut').value || null,
    }),
  });
  if (!vals) return;
  try {
    await apiPut(`/api/admin/professors/${id}/baixa`, { en_baixa: true, id_substitut: vals.id_substitut });
    await carregarLlistaProfessors();
    Swal.fire({ icon: 'success', title: 'Baixa activada!', timer: 1400, showConfirmButton: false });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GRUPS (organitzats per any)
// ══════════════════════════════════════════════════════════════════════════════
document.querySelector('[data-bs-target="#tab-grups"]')
  ?.addEventListener('shown.bs.tab', carregarLlistaGrups);

async function carregarLlistaGrups() {
  // ?all=true → retorna grups de TOTS els cursos
  const r    = await apiGet('/api/admin/grups?all=true');
  const tots = r?.grups || [];

  // Actualitzar els selectors amb els del curs actiu
  await carregarGrupsSelector();

  const div = $('llista-grups');
  if (!tots.length) {
    div.innerHTML = '<p class="text-muted small mt-2">Cap grup registrat.</p>'; return;
  }

  // Agrupar per any_escolar (desc)
  const perAny = {};
  tots.forEach(g => {
    if (!perAny[g.any_escolar]) perAny[g.any_escolar] = [];
    perAny[g.any_escolar].push(g);
  });

  div.innerHTML = Object.keys(perAny)
    .sort((a, b) => b.localeCompare(a))
    .map(any => `
      <div class="any-seccio">
        <div class="any-seccio-titol">
          <span>📁 Curs ${any}</span>
          <span class="badge-count">${perAny[any].length} grup${perAny[any].length !== 1 ? 's' : ''}</span>
        </div>
        ${perAny[any].map(g => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-nom">${g.nom}</div>
              <div class="item-sub">${g.curs || '—'}</div>
            </div>
            <div class="item-actions">
              <button class="btn-delete" onclick="eliminarGrup(${g.id_grup})">🗑 Eliminar</button>
            </div>
          </div>`).join('')}
      </div>`).join('');
}

// Sincronitza selectors del formulari de grups → inputs de text
const _gNomPreset  = $('g-nom-preset');
if (_gNomPreset) _gNomPreset.addEventListener('change', () => {
  if (_gNomPreset.value) $('g-nom').value = _gNomPreset.value;
});

const _gCursPreset = $('g-curs-preset');
if (_gCursPreset) _gCursPreset.addEventListener('change', () => {
  if (_gCursPreset.value) $('g-curs').value = _gCursPreset.value;
});

$('btn-crear-grup').addEventListener('click', async () => {
  const nom  = $('g-nom').value.trim();
  const curs = $('g-curs').value.trim();
  if (!nom)  return Swal.fire('Camp buit', 'El nom del grup és obligatori.', 'warning');
  if (!curs) return Swal.fire('Camp buit', 'El curs/nivell és obligatori.', 'warning');
  try {
    await apiPost('/api/admin/grups', { nom, curs, any_escolar: anyActiu });
    $('g-nom').value = ''; $('g-curs').value = '';
    if ($('g-nom-preset'))  $('g-nom-preset').value  = '';
    if ($('g-curs-preset')) $('g-curs-preset').value = '';
    await carregarLlistaGrups();
    Swal.fire({ icon: 'success', title: 'Grup afegit!', timer: 1500, showConfirmButton: false });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
});

window.eliminarGrup = async (id) => {
  const ok = await Swal.fire({ title: 'Eliminar grup?',
    text: 'Els horaris existents es mantindran.', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#ef4444',
    confirmButtonText: 'Sí, elimina', cancelButtonText: 'Cancel·la' });
  if (!ok.isConfirmed) return;
  try {
    await apiDelete(`/api/admin/grups/${id}`);
    await carregarLlistaGrups();  // refresc immediat sense F5
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// ASSIGNATURES
// ══════════════════════════════════════════════════════════════════════════════
document.querySelector('[data-bs-target="#tab-assignatures"]')
  ?.addEventListener('shown.bs.tab', carregarLlistaAssignatures);

async function carregarLlistaAssignatures() {
  const r = await apiGet('/api/admin/assignatures');
  _assignatures = r?.assignatures || [];
  omplirSelectsCatalecs();

  const div = $('llista-assignatures');
  if (!_assignatures.length) {
    div.innerHTML = '<p class="text-muted small mt-2">Cap matèria registrada.</p>'; return;
  }
  div.innerHTML = _assignatures.map(a => `
    <div class="item-row">
      <span class="color-dot" style="background:${a.color_calendari}"></span>
      <div class="item-info">
        <div class="item-nom">${a.nom_asignatura}</div>
      </div>
      <div class="item-actions">
        <button class="btn-editar" onclick="editarMateria(${a.id_asignatura})">✏ Editar</button>
        <button class="btn-delete" onclick="eliminarAssignatura(${a.id_asignatura})">🗑 Eliminar</button>
      </div>
    </div>`).join('');
}

$('btn-crear-assignatura').addEventListener('click', async () => {
  const nom = $('a-nom').value.trim();
  if (!nom) return Swal.fire('Camp buit', 'El nom és obligatori.', 'warning');
  try {
    await apiPost('/api/admin/assignatures', { nom_asignatura: nom, color_calendari: $('a-color').value });
    $('a-nom').value = '';
    await carregarLlistaAssignatures();
    Swal.fire({ icon: 'success', title: 'Matèria afegida!', timer: 1500, showConfirmButton: false });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
});

// ── Editar matèria (panel inline) ─────────────────────────────────────────────
let _editMateriaId = null;

window.editarMateria = (id) => {
  const a = _assignatures.find(x => x.id_asignatura === id);
  if (!a) return;
  _editMateriaId = id;
  $('edit-a-nom').value   = a.nom_asignatura;
  $('edit-a-color').value = a.color_calendari || '#1565c0';
  $('edit-materia-msg').textContent = '';
  $('edit-materia-panel').style.display = '';
  $('edit-a-nom').focus();
};

$('btn-guardar-materia').addEventListener('click', async () => {
  if (!_editMateriaId) return;
  const nom   = $('edit-a-nom').value.trim();
  const color = $('edit-a-color').value;
  if (!nom) return msg('edit-materia-msg', 'El nom és obligatori.', 'err');
  try {
    await apiPut(`/api/admin/assignatures/${_editMateriaId}`, { nom_asignatura: nom, color_calendari: color });
    $('edit-materia-panel').style.display = 'none';
    _editMateriaId = null;
    await carregarLlistaAssignatures();
    Swal.fire({ icon: 'success', title: 'Matèria actualitzada!', timer: 1500, showConfirmButton: false });
  } catch (e) { msg('edit-materia-msg', e.message, 'err'); }
});

$('btn-cancel-materia').addEventListener('click', () => {
  $('edit-materia-panel').style.display = 'none';
  _editMateriaId = null;
});

window.eliminarAssignatura = async (id) => {
  const ok = await Swal.fire({ title: 'Eliminar matèria?', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#ef4444',
    confirmButtonText: 'Sí, elimina', cancelButtonText: 'Cancel·la' });
  if (!ok.isConfirmed) return;
  try {
    await apiDelete(`/api/admin/assignatures/${id}`);
    if (_editMateriaId === id) { $('edit-materia-panel').style.display = 'none'; _editMateriaId = null; }
    await carregarLlistaAssignatures();
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// AULES (només nom)
// ══════════════════════════════════════════════════════════════════════════════
document.querySelector('[data-bs-target="#tab-aules"]')
  ?.addEventListener('shown.bs.tab', carregarLlistaAules);

async function carregarLlistaAules() {
  const r = await apiGet('/api/admin/aules');
  _aules = r?.aules || [];
  omplirSelectsCatalecs();

  const div = $('llista-aules');
  if (!_aules.length) {
    div.innerHTML = '<p class="text-muted small mt-2">Cap aula registrada.</p>'; return;
  }
  div.innerHTML = _aules.map(a => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-nom">${a.nom_aula}</div>
      </div>
      <div class="item-actions">
        <button class="btn-delete" onclick="eliminarAula(${a.id_aula})">🗑 Eliminar</button>
      </div>
    </div>`).join('');
}

$('btn-crear-aula').addEventListener('click', async () => {
  const nom = $('au-nom').value.trim();
  if (!nom) return Swal.fire('Camp buit', 'El nom de l\'aula és obligatori.', 'warning');
  try {
    await apiPost('/api/admin/aules', { nom_aula: nom });
    $('au-nom').value = '';
    await carregarLlistaAules();
    Swal.fire({ icon: 'success', title: 'Aula afegida!', timer: 1500, showConfirmButton: false });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
});

window.eliminarAula = async (id) => {
  const ok = await Swal.fire({ title: 'Eliminar aula?', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#ef4444',
    confirmButtonText: 'Sí, elimina', cancelButtonText: 'Cancel·la' });
  if (!ok.isConfirmed) return;
  try {
    await apiDelete(`/api/admin/aules/${id}`);
    await carregarLlistaAules();  // refresc immediat
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// CLASSES TEMPORALS
// ══════════════════════════════════════════════════════════════════════════════
document.querySelector('[data-bs-target="#tab-ct"]')
  ?.addEventListener('shown.bs.tab', carregarLlistaCT);

async function carregarLlistaCT() {
  const r  = await apiGet(`/api/classes-temporals/all?any_escolar=${encodeURIComponent(anyActiu)}`);
  const ct = r?.classes || [];
  const div = $('llista-ct');
  if (!ct.length) {
    div.innerHTML = '<p class="text-muted small mt-2">Cap classe temporal per a aquest curs.</p>'; return;
  }
  div.innerHTML = ct.map(c => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-nom">${c.data?.slice(0,10)} · <strong>${c.grup}</strong> · ${c.nom_asignatura}</div>
        <div class="item-sub">${c.hora_inici?.slice(0,5)}–${c.hora_fi?.slice(0,5)}
          ${c.nom_professor ? ' · ' + c.nom_professor : ''}
          ${c.nom_aula ? ' · ' + c.nom_aula : ''}
          ${c.nota ? ' · ' + c.nota : ''}</div>
      </div>
      <div class="item-actions">
        <button class="btn-delete" onclick="eliminarCT(${c.id_classe})">🗑 Eliminar</button>
      </div>
    </div>`).join('');
}

$('btn-crear-ct').addEventListener('click', async () => {
  const data  = $('ct-data').value;
  const grup  = $('ct-grup').value;
  const asig  = $('ct-asignatura').value;
  const inici = $('ct-inici').value.trim();
  const fi    = $('ct-fi').value.trim();

  if (!RE_HORA.test(inici) || !RE_HORA.test(fi))
    return msg('ct-msg', 'Hores no vàlides. Format HH:MM.', 'err');
  if (!data || !grup || !asig)
    return msg('ct-msg', 'Data, grup i assignatura son obligatoris.', 'err');

  try {
    await apiPost('/api/classes-temporals', {
      data, grup, id_asignatura: asig,
      id_professor: $('ct-professor').value || null,
      id_aula:      $('ct-aula').value      || null,
      hora_inici: inici, hora_fi: fi,
      nota: $('ct-nota').value.trim() || null,
      any_escolar: anyActiu,
    });
    msg('ct-msg', '✓ Classe temporal creada!', 'ok');
    await carregarLlistaCT();
    if (grupActiu === grup) carregarHorari();
  } catch (e) { msg('ct-msg', e.message, 'err'); }
});

window.eliminarCT = async (id) => {
  const ok = await Swal.fire({ title: 'Eliminar classe temporal?', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#ef4444',
    confirmButtonText: 'Sí, elimina', cancelButtonText: 'Cancel·la' });
  if (!ok.isConfirmed) return;
  try {
    await apiDelete(`/api/classes-temporals/${id}`);
    await carregarLlistaCT();  // refresc immediat
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// DIES ESPECIALS
// ══════════════════════════════════════════════════════════════════════════════
document.querySelector('[data-bs-target="#tab-dies"]')
  ?.addEventListener('shown.bs.tab', carregarLlistaDies);

async function carregarLlistaDies() {
  const r   = await apiGet(`/api/dies-especials?any_escolar=${encodeURIComponent(anyActiu)}`);
  const die = r?.dies_especials || [];
  const div = $('llista-de');
  if (!die.length) {
    div.innerHTML = '<p class="text-muted small mt-2">Cap dia especial per a aquest curs.</p>'; return;
  }
  div.innerHTML = die.map(d => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-nom">${d.nom_esdeveniment} <span class="item-badge">${d.tipus}</span></div>
        <div class="item-sub">${d.data_inici?.slice(0,10)} → ${d.data_fi?.slice(0,10)}
          ${d.grup ? ' · Grup: ' + d.grup : ' · Global'}</div>
      </div>
      <div class="item-actions">
        <button class="btn-delete" onclick="eliminarDE(${d.id_dia})">🗑 Eliminar</button>
      </div>
    </div>`).join('');
}

$('btn-crear-de').addEventListener('click', async () => {
  const nom   = $('de-nom').value.trim();
  const inici = $('de-inici').value;
  const fi    = $('de-fi').value;
  if (!nom || !inici || !fi) return msg('de-msg', 'Omple nom, data inici i data fi.', 'err');
  if (fi < inici) return msg('de-msg', 'La data fi ha de ser igual o posterior a la d\'inici.', 'err');
  try {
    await apiPost('/api/dies-especials', {
      nom_esdeveniment: nom, tipus: $('de-tipus').value,
      data_inici: inici, data_fi: fi,
      grup: $('de-grup').value || null,
      any_escolar: anyActiu,
    });
    msg('de-msg', '✓ Dia especial afegit!', 'ok');
    $('de-nom').value = ''; $('de-inici').value = ''; $('de-fi').value = '';
    await carregarLlistaDies();  // refresc immediat
  } catch (e) { msg('de-msg', e.message, 'err'); }
});

window.eliminarDE = async (id) => {
  const ok = await Swal.fire({ title: 'Eliminar dia especial?', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#ef4444',
    confirmButtonText: 'Sí, elimina', cancelButtonText: 'Cancel·la' });
  if (!ok.isConfirmed) return;
  try {
    await apiDelete(`/api/dies-especials/${id}`);
    await carregarLlistaDies();  // refresc immediat sense F5
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// ANY ESCOLAR
// ══════════════════════════════════════════════════════════════════════════════
document.querySelector('[data-bs-target="#tab-curs"]')
  ?.addEventListener('shown.bs.tab', carregarLlistaCursos);

async function carregarLlistaCursos() {
  const r = await apiGet('/api/configuracio');
  const cursos = r?.cursos || [];
  const div = $('llista-cursos');
  div.innerHTML = cursos.map(c => {
    const ini = c.data_inici?.slice(0, 10) || '—';
    const fi  = c.data_fi?.slice(0, 10)    || '—';
    return `
    <div class="item-row">
      <div class="item-info">
        <div class="item-nom">${c.any_escolar}
          ${c.actiu ? '<span class="item-badge actiu">✓ Actiu</span>' : ''}
        </div>
        <div class="item-sub">${ini} → ${fi}</div>
      </div>
      <div class="item-actions">
        <button class="btn-editar" onclick="editarDatesCurs(${c.id_curs},'${ini}','${fi}')">✏ Dates</button>
        ${!c.actiu ? `<button class="btn-activar" onclick="activarCurs(${c.id_curs})">Activar</button>` : ''}
        ${!c.actiu ? `<button class="btn-delete" onclick="eliminarCurs(${c.id_curs})">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

window.editarDatesCurs = async (id, dataInici, dataFi) => {
  const { value: vals } = await Swal.fire({
    title: 'Editar dates del curs',
    html: `
      <div style="text-align:left;padding:0.5rem 0">
        <label style="display:block;margin-bottom:4px;font-weight:500">Data inici</label>
        <input id="swal-di" type="date" value="${dataInici !== '—' ? dataInici : ''}"
               style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:12px">
        <label style="display:block;margin-bottom:4px;font-weight:500">Data fi</label>
        <input id="swal-df" type="date" value="${dataFi !== '—' ? dataFi : ''}"
               style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px">
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancel·la',
    preConfirm: () => {
      const ini = document.getElementById('swal-di').value;
      const fi  = document.getElementById('swal-df').value;
      if (!ini || !fi) { Swal.showValidationMessage('Data inici i data fi son obligatòries.'); return false; }
      if (fi <= ini)   { Swal.showValidationMessage("La data fi ha de ser posterior a la d'inici."); return false; }
      return { data_inici: ini, data_fi: fi };
    },
  });
  if (!vals) return;
  try {
    await apiPut(`/api/configuracio/${id}/dates`, vals);
    Swal.fire({ icon: 'success', title: 'Dates actualitzades!', timer: 1500, showConfirmButton: false });
    await carregarLlistaCursos();
    await carregarSelectorAny();
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

$('btn-crear-curs').addEventListener('click', async () => {
  const any   = $('cc-any').value.trim();
  const inici = $('cc-inici').value;
  const fi    = $('cc-fi').value;
  if (!any || !inici || !fi) return msg('cc-msg', 'Omple tots els camps.', 'err');
  if (!/^\d{4}\/\d{4}$/.test(any)) return msg('cc-msg', 'Format incorrecte. Ex: 2026/2027', 'err');
  try {
    await apiPost('/api/configuracio', { any_escolar: any, data_inici: inici, data_fi: fi });
    msg('cc-msg', `✓ Curs ${any} creat!`, 'ok');
    $('cc-any').value = ''; $('cc-inici').value = ''; $('cc-fi').value = '';
    await carregarLlistaCursos();  // refresc immediat
    await carregarSelectorAny();
  } catch (e) { msg('cc-msg', e.message, 'err'); }
});

window.activarCurs = async (id) => {
  const ok = await Swal.fire({ title: 'Canviar curs actiu?',
    text: 'El selector de curs del sistema s\'actualitzarà.',
    icon: 'question', showCancelButton: true,
    confirmButtonText: 'Sí, activa', cancelButtonText: 'Cancel·la' });
  if (!ok.isConfirmed) return;
  try {
    const r = await apiPost(`/api/configuracio/${id}/activar`);
    Swal.fire({ icon: 'success', title: `Curs ${r.any_escolar_actiu} activat!`, timer: 2000, showConfirmButton: false });
    await carregarLlistaCursos();  // refresc immediat
    await carregarSelectorAny();
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

window.eliminarCurs = async (id) => {
  const ok = await Swal.fire({ title: 'Eliminar curs?', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#ef4444',
    confirmButtonText: 'Sí, elimina', cancelButtonText: 'Cancel·la' });
  if (!ok.isConfirmed) return;
  try {
    await apiDelete(`/api/configuracio/${id}`);
    await carregarLlistaCursos();  // refresc immediat sense F5
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
(function init() {
  if (getToken() && getUsuari()) iniciarApp();
})();
