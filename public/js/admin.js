// public/js/admin.js
// Lògica del Panel d'Administració.
// Seguretat: redirigeix usuaris no-admin abans de res.

'use strict';

const API = '';

// ─── Any escolar ─────────────────────────────────────────────────────────────
function obtenirAnyEscolarActual(data = new Date()) {
  const mes = data.getMonth() + 1;
  const any = data.getFullYear();
  if (mes >= 9) return `${any}/${any + 1}`;
  if (mes <= 6) return `${any - 1}/${any}`;
  return `${any}/${any + 1}`;
}

function generarAnysEscolars() {
  const actual  = obtenirAnyEscolarActual();
  const anyInici = parseInt(actual.split('/')[0], 10);
  return [
    `${anyInici - 1}/${anyInici}`,
    `${anyInici}/${anyInici + 1}`,
    `${anyInici + 1}/${anyInici + 2}`,
  ];
}

function obtenirAdminAnySeleccionat() {
  const sel = document.getElementById('admin-selector-any');
  return (sel && sel.value) ? sel.value : obtenirAnyEscolarActual();
}

function inicialitzarSelectorAdminAny() {
  const sel = document.getElementById('admin-selector-any');
  if (!sel) return;
  const anys   = generarAnysEscolars();
  const actual = obtenirAnyEscolarActual();
  sel.innerHTML = anys.map(a =>
    `<option value="${a}"${a === actual ? ' selected' : ''}>${a}</option>`
  ).join('');
  sel.style.display = 'block';
  sel.addEventListener('change', () => {
    // Recarregar grups per al nou any
    carregarGrups();
    // Si hi ha un grup seleccionat a la taula, recarregar
    const grupFiltrat = document.getElementById('filtre-grup').value;
    if (grupFiltrat) carregarTaulaHoraris(grupFiltrat);
    // Si la pestanya d'activitats és visible, recarregar-les
    const seccioActs = document.getElementById('seccio-extraescolars');
    if (seccioActs && seccioActs.classList.contains('visible')) {
      carregarTaulaActivitats();
    }
    // Si la pestanya de dies especials és visible, recarregar-los
    const seccioDies = document.getElementById('seccio-dies-especials');
    if (seccioDies && seccioDies.classList.contains('visible')) {
      carregarTaulaDiesEspecials();
    }
  });
}

async function carregarGrups() {
  const any = obtenirAdminAnySeleccionat();

  // Mentre carrega: marcar com a "carregant"
  ['h-grup', 'filtre-grup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">— Carregant grups… —</option>`;
  });

  try {
    const res = await fetch(
      `${API}/api/admin/grups?any_escolar=${encodeURIComponent(any)}`,
      { headers: { 'Authorization': `Bearer ${token()}` } }
    );

    if (!res.ok) {
      console.error('Error HTTP carregant grups:', res.status);
      ['h-grup', 'filtre-grup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<option value="">— Error carregant grups —</option>`;
      });
      return;
    }

    const { grups } = await res.json();

    if (!grups || grups.length === 0) {
      ['h-grup', 'filtre-grup'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = id === 'filtre-grup'
          ? `<option value="">Tots els grups</option>`
          : `<option value="">— Sense grups per a ${any} —</option>`;
      });
      return;
    }

    const opts = grups.map(g => `<option value="${g}">${g}</option>`).join('');
    ['h-grup', 'filtre-grup'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = id === 'filtre-grup'
        ? `<option value="">Tots els grups</option>${opts}`
        : `<option value="">— Selecciona —</option>${opts}`;
    });

  } catch (err) {
    console.error('Error carregant grups:', err.message);
    ['h-grup', 'filtre-grup'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">— Error de connexió —</option>`;
    });
  }
}

// ─── Seguretat: protecció de la pàgina ───────────────────────────────────────
// S'executa immediatament en carregar l'script.
(function protegirPagina() {
  const raw    = localStorage.getItem('usuari');
  const usuari = raw ? JSON.parse(raw) : null;
  const token  = localStorage.getItem('token');

  if (!token || !usuari) {
    // No hi ha sessió → al login
    window.location.href = 'index.html';
    return;
  }

  if (usuari.rol !== 'admin') {
    // Sessió vàlida però no és admin → al dashboard normal
    window.location.href = 'index.html';
    return;
  }

  // Tot correcte: mostrem el nom a la navbar
  document.getElementById('nav-nom').textContent = usuari.nom;
})();

// ─── Helpers ─────────────────────────────────────────────────────────────────
const token = () => localStorage.getItem('token');

function mostrarError(idCont, missatge, llista = []) {
  const el = document.getElementById(idCont);
  el.style.display = 'block';
  el.innerHTML = `<strong>⚠️ ${missatge}</strong>${
    llista.length > 0
      ? '<ul>' + llista.map(e => `<li>${e}</li>`).join('') + '</ul>'
      : ''
  }`;
  document.getElementById(idCont.replace('error','ok')).style.display = 'none';
}

function mostrarOk(idCont, missatge) {
  const el = document.getElementById(idCont);
  el.style.display   = 'block';
  el.textContent     = `✅ ${missatge}`;
  document.getElementById(idCont.replace('ok','error')).style.display = 'none';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function amagarMissatges(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function toast(missatge, tipus = 'ok') {
  const t = document.createElement('div');
  t.className   = `toast ${tipus}`;
  t.textContent = missatge;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function formatHora(h) {
  return h ? h.substring(0, 5) : '—';
}

// ─── Pestanyes ────────────────────────────────────────────────────────────────

/**
 * Activa la pestanya indicada i amaga la resta.
 * @param {string} tabId  'horaris' | 'extraescolars' | 'dies-especials'
 */
function activarPestanya(tabId) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('activa'));
  document.querySelectorAll('.seccio').forEach(s => s.classList.remove('visible'));

  const btn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  const sec = document.getElementById(`seccio-${tabId}`);
  if (btn) btn.classList.add('activa');
  if (sec) sec.classList.add('visible');
}

// Clicks de les pestanyes
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activarPestanya(tab.dataset.tab);
    // Actualitzem el hash de la URL perquè els links directes des del
    // dashboard (admin.html#extraescolars, etc.) funcionin correctament
    history.replaceState(null, '', `#${tab.dataset.tab}`);
  });
});

// ── Navegació per hash de la URL ──────────────────────────────────────────────
// Permet obrir admin.html#extraescolars o admin.html#dies-especials directament
// des dels botons del dashboard principal (index.html).
(function llegirHashInicial() {
  const TABS_VALIDS = ['horaris', 'extraescolars', 'dies-especials'];
  const hash        = window.location.hash.replace('#', '');
  if (hash && TABS_VALIDS.includes(hash)) {
    activarPestanya(hash);
  }
  // Si no hi ha hash vàlid, es manté la pestanya activa per defecte (horaris)
})();

// ─── Logout ───────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('usuari');
  window.location.href = 'index.html';
});

// ═══════════════════════════════════════════════════════════════════════════════
// CÀRREGA DE DADES PER ALS SELECTS (aules, professors, assignatures)
// ═══════════════════════════════════════════════════════════════════════════════

async function carregarSelects() {
  try {
    const headers = { 'Authorization': `Bearer ${token()}` };

    const [resAules, resProfessors, resAssignatures] = await Promise.all([
      fetch(`${API}/api/admin/aules`,        { headers }),
      fetch(`${API}/api/admin/professors`,   { headers }),
      fetch(`${API}/api/admin/assignatures`, { headers }),
    ]);

    if (resAules.ok) {
      const { aules } = await resAules.json();
      const opts = aules.map(a =>
        `<option value="${a.id_aula}">${a.nom_aula} (cap. ${a.capacitat})</option>`
      ).join('');
      document.getElementById('h-aula').innerHTML = `<option value="">—</option>${opts}`;
      document.getElementById('a-aula').innerHTML =
        `<option value="">— Sense aula —</option>${opts}`;
    }

    if (resProfessors.ok) {
      const { professors } = await resProfessors.json();
      document.getElementById('h-profesor').innerHTML =
        `<option value="">—</option>` +
        professors.map(p =>
          `<option value="${p.id_profesor}">${p.nom_usuari} (${p.especialitat})</option>`
        ).join('');
    }

    if (resAssignatures.ok) {
      const { assignatures } = await resAssignatures.json();
      document.getElementById('h-asignatura').innerHTML =
        `<option value="">—</option>` +
        assignatures.map(a =>
          `<option value="${a.id_asignatura}">${a.nom_asignatura}</option>`
        ).join('');
    }

  } catch (err) {
    console.error('Error carregant selects:', err.message);
  }
}

carregarSelects();
inicialitzarSelectorAdminAny();
carregarGrups();

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 1: HORARIS — CREAR
// ═══════════════════════════════════════════════════════════════════════════════

document.getElementById('btn-crear-horari').addEventListener('click', async () => {

  amagarMissatges('horari-error', 'horari-ok');

  const dia           = document.getElementById('h-dia').value;
  const hora_inici    = document.getElementById('h-inici').value;
  const hora_fi       = document.getElementById('h-fi').value;
  const id_asignatura = parseInt(document.getElementById('h-asignatura').value);
  const id_profesor   = parseInt(document.getElementById('h-profesor').value);
  const id_aula       = parseInt(document.getElementById('h-aula').value);
  const grup          = document.getElementById('h-grup').value;

  const errors = [];
  if (!dia)            errors.push('Selecciona un dia de la setmana.');
  if (!hora_inici)     errors.push('Introdueix l\'hora d\'inici.');
  if (!hora_fi)        errors.push('Introdueix l\'hora de fi.');
  if (hora_inici && hora_fi && hora_fi <= hora_inici)
                       errors.push('L\'hora de fi ha de ser posterior a l\'inici.');
  if (!id_asignatura)  errors.push('Selecciona una assignatura.');
  if (!id_profesor)    errors.push('Selecciona un professor.');
  if (!id_aula)        errors.push('Selecciona una aula.');
  if (!grup)           errors.push('Selecciona un grup.');

  if (errors.length > 0) {
    Swal2.errorDetallat('Corregeix els errors del formulari', errors);
    return;
  }

  // ── Spinner ON ────────────────────────────────────────────────────────────
  const btn = document.getElementById('btn-crear-horari');
  Spinner.activar(btn, 'Creant...');

  try {
    const res = await fetch(`${API}/api/horaris`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token()}`,
      },
      body: JSON.stringify({
        dia_semana:  dia,
        hora_inici:  hora_inici + ':00',
        hora_fi:     hora_fi    + ':00',
        id_asignatura, id_profesor, id_aula, grup,
        any_escolar: obtenirAdminAnySeleccionat(),
      }),
    });

    const dades = await res.json();

    if (res.ok) {
      Swal2.ok(`Franja creada correctament (ID: ${dades.id_horari}).`);
      ['h-dia','h-inici','h-fi','h-asignatura','h-profesor','h-aula','h-grup']
        .forEach(id => document.getElementById(id).value = '');
      const grupFiltrat = document.getElementById('filtre-grup').value;
      if (grupFiltrat) carregarTaulaHoraris(grupFiltrat);

    } else if (res.status === 409) {
      Swal2.errorDetallat('Solapament detectat — franja no creada', dades.conflictes || [dades.error]);

    } else {
      Swal2.err(dades.error || 'Error desconegut.');
    }

  } catch (err) {
    Swal2.err('No s\'ha pogut connectar amb el servidor.');

  } finally {
    // ── Spinner OFF (sempre, tant si va bé com si falla) ─────────────────
    Spinner.desactivar(btn);
  }
});

// ─── Carregar taula d'horaris ─────────────────────────────────────────────────
document.getElementById('btn-filtrar').addEventListener('click', () => {
  const grup = document.getElementById('filtre-grup').value;
  carregarTaulaHoraris(grup);
});

async function carregarTaulaHoraris(grup) {
  const tbody = document.getElementById('horaris-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="taula-buit">Carregant...</td></tr>';

  const anySeleccionat = obtenirAdminAnySeleccionat();
  const url = grup
    ? `${API}/api/horaris?grup=${encodeURIComponent(grup)}&any_escolar=${encodeURIComponent(anySeleccionat)}`
    : `${API}/api/admin/horaris?any_escolar=${encodeURIComponent(anySeleccionat)}`;

  const res   = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token()}` }
  });
  const dades = await res.json();

  const horaris = dades.horaris || [];

  if (horaris.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="taula-buit">Cap franja trobada.</td></tr>';
    return;
  }

  tbody.innerHTML = horaris.map(h => `
    <tr>
      <td><code>${h.id_horari}</code></td>
      <td><span class="pill-dia">${h.dia_semana}</span></td>
      <td>${formatHora(h.hora_inici)}</td>
      <td>${formatHora(h.hora_fi)}</td>
      <td>${h.nom_asignatura}</td>
      <td>${h.nom_professor}</td>
      <td>${h.nom_aula}</td>
      <td>${h.grup}</td>
      <td>
        <button class="btn-eliminar"
          onclick="confirmarEliminacio('horari', ${h.id_horari},
          '${h.dia_semana} ${formatHora(h.hora_inici)}–${formatHora(h.hora_fi)} · ${h.grup}')">
          🗑 Eliminar
        </button>
      </td>
    </tr>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 2: ACTIVITATS — CREAR
// ═══════════════════════════════════════════════════════════════════════════════

document.getElementById('btn-crear-activitat').addEventListener('click', async () => {

  amagarMissatges('activitat-error', 'activitat-ok');

  const nom         = document.getElementById('a-nom').value.trim();
  const dia         = document.getElementById('a-dia').value || null;
  const hora_inici  = document.getElementById('a-inici').value;
  const hora_fi     = document.getElementById('a-fi').value;
  const id_aula     = parseInt(document.getElementById('a-aula').value) || null;
  const responsable = document.getElementById('a-responsable').value.trim();
  const places      = parseInt(document.getElementById('a-places').value);

  const errors = [];
  if (!nom)                errors.push('El nom de l\'activitat és obligatori.');
  if (!hora_inici)         errors.push('Introdueix l\'hora d\'inici.');
  if (!hora_fi)            errors.push('Introdueix l\'hora de fi.');
  if (hora_inici && hora_fi && hora_fi <= hora_inici)
                           errors.push('L\'hora de fi ha de ser posterior a l\'inici.');
  if (!responsable)        errors.push('El responsable és obligatori.');
  if (!places || places < 1) errors.push('Les places màximes han de ser ≥ 1.');

  if (errors.length > 0) {
    Swal2.errorDetallat('Corregeix els errors del formulari', errors);
    return;
  }

  // ── Spinner ON ────────────────────────────────────────────────────────────
  const btn = document.getElementById('btn-crear-activitat');
  Spinner.activar(btn, 'Creant...');

  try {
    const res = await fetch(`${API}/api/admin/activitats`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token()}`,
      },
      body: JSON.stringify({
        nom,
        dia_semana:     dia,
        hora_inici:     hora_inici + ':00',
        hora_fi:        hora_fi    + ':00',
        id_aula,
        responsable,
        places_maximes: places,
        any_escolar:    obtenirAdminAnySeleccionat(),
      }),
    });

    const dades = await res.json();

    if (res.ok) {
      Swal2.ok(`Activitat "${nom}" creada correctament.`);
      ['a-nom','a-dia','a-inici','a-fi','a-aula','a-responsable','a-places']
        .forEach(id => document.getElementById(id).value = '');
      carregarTaulaActivitats();

    } else {
      Swal2.err(dades.error || 'Error desconegut.');
    }

  } catch (err) {
    Swal2.err('No s\'ha pogut connectar amb el servidor.');

  } finally {
    // ── Spinner OFF (sempre, tant si va bé com si falla) ─────────────────
    Spinner.desactivar(btn);
  }
});

// ─── Carregar taula d'activitats ──────────────────────────────────────────────
document.getElementById('btn-carregar-activitats')
  .addEventListener('click', carregarTaulaActivitats);

async function carregarTaulaActivitats() {
  const tbody = document.getElementById('activitats-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="taula-buit">Carregant...</td></tr>';

  const anySeleccionat = obtenirAdminAnySeleccionat();
  const res   = await fetch(`${API}/api/activitats?any_escolar=${encodeURIComponent(anySeleccionat)}`, {
    headers: { 'Authorization': `Bearer ${token()}` }
  });
  const dades = await res.json();
  const acts  = dades.activitats || [];

  if (acts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="taula-buit">Cap activitat trobada.</td></tr>';
    return;
  }

  tbody.innerHTML = acts.map(a => `
    <tr>
      <td><code>${a.id_activitat}</code></td>
      <td><strong>${a.nom}</strong></td>
      <td>${a.dia_semana
        ? `<span class="pill-dia">${a.dia_semana}</span>`
        : '—'}</td>
      <td>${formatHora(a.hora_inici)} – ${formatHora(a.hora_fi)}</td>
      <td>${a.responsable}</td>
      <td>
        <span style="color:${a.places_lliures > 0 ? 'var(--verd-ok)' : 'var(--vermell-err)'}">
          ${a.places_lliures} / ${a.places_maximes}
        </span>
      </td>
      <td>
        <button class="btn-eliminar"
          onclick="confirmarEliminacio('activitat', ${a.id_activitat}, '${a.nom}')">
          🗑 Eliminar
        </button>
      </td>
    </tr>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL DE CONFIRMACIÓ D'ELIMINACIÓ
// ═══════════════════════════════════════════════════════════════════════════════

async function confirmarEliminacio(tipus, id, descripcio) {
  const mapa = {
    horari:       { text: 'franja horària',  ruta: `/api/admin/horaris/${id}`       },
    activitat:    { text: 'activitat',        ruta: `/api/admin/activitats/${id}`    },
    'dia-especial': { text: 'dia especial',  ruta: `/api/dies-especials/${id}`      },
  };

  const confirmat = await Swal2.confirmar({
    titol:       `Eliminar ${mapa[tipus].text}`,
    text:        `Estàs a punt d'eliminar: "${descripcio}". Aquesta acció no es pot desfer.`,
    btnConfirmar: '🗑 Sí, eliminar',
  });

  if (!confirmat) return;

  try {
    const res   = await fetch(`${API}${mapa[tipus].ruta}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${token()}` },
    });
    const dades = await res.json();

    if (res.ok) {
      Swal2.ok(dades.missatge);
      if (tipus === 'horari') {
        carregarTaulaHoraris(document.getElementById('filtre-grup').value);
      } else if (tipus === 'dia-especial') {
        carregarTaulaDiesEspecials();
      } else {
        carregarTaulaActivitats();
      }
    } else if (res.status === 409) {
      // Activitat amb inscripcions — mostrem el detall
      Swal2.errorDetallat(dades.error, dades.detall ? [dades.detall] : []);
    } else {
      Swal2.err(dades.error || 'Error eliminant.');
    }
  } catch {
    Swal2.err('Error de connexió.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC 3: DIES ESPECIALS — CREAR
// ═══════════════════════════════════════════════════════════════════════════════

document.getElementById('btn-crear-dia').addEventListener('click', async () => {

  amagarMissatges('dies-error', 'dies-ok');

  const nom       = document.getElementById('de-nom').value.trim();
  const tipus     = document.getElementById('de-tipus').value;
  const dataInici = document.getElementById('de-inici').value;
  const dataFi    = document.getElementById('de-fi').value;
  const grup      = document.getElementById('de-grup').value.trim() || null;

  const errors = [];
  if (!nom)       errors.push('El nom de l\'esdeveniment és obligatori.');
  if (!tipus)     errors.push('Selecciona el tipus (Festiu, Excursió o Colònies).');
  if (!dataInici) errors.push('Introdueix la data d\'inici.');
  if (!dataFi)    errors.push('Introdueix la data de fi.');
  if (dataInici && dataFi && dataFi < dataInici)
                  errors.push('La data de fi ha de ser igual o posterior a la d\'inici.');

  if (errors.length > 0) {
    Swal2.errorDetallat('Corregeix els errors del formulari', errors);
    return;
  }

  const btn = document.getElementById('btn-crear-dia');
  Spinner.activar(btn, 'Registrant...');

  try {
    const res = await fetch(`${API}/api/dies-especials`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token()}`,
      },
      body: JSON.stringify({
        nom_esdeveniment: nom,
        tipus,
        data_inici: dataInici,
        data_fi:    dataFi,
        grup,
      }),
    });

    const dades = await res.json();

    if (res.ok) {
      Swal2.ok(`Dia "${nom}" registrat correctament (curs ${dades.any_escolar}).`);
      ['de-nom', 'de-tipus', 'de-inici', 'de-fi', 'de-grup']
        .forEach(id => document.getElementById(id).value = '');
      carregarTaulaDiesEspecials();

    } else {
      Swal2.err(dades.error || 'Error desconegut.');
    }

  } catch {
    Swal2.err('No s\'ha pogut connectar amb el servidor.');

  } finally {
    Spinner.desactivar(btn);
  }
});

// ─── Carregar taula de dies especials ─────────────────────────────────────────
document.getElementById('btn-carregar-dies')
  .addEventListener('click', carregarTaulaDiesEspecials);

const ICONA_TIPUS = {
  festiu:   '🔴',
  excursio: '🟢',
  colonies: '🟣',
};

async function carregarTaulaDiesEspecials() {
  const tbody = document.getElementById('dies-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="taula-buit">Carregant...</td></tr>';

  const anySeleccionat = obtenirAdminAnySeleccionat();

  try {
    const res   = await fetch(
      `${API}/api/dies-especials?any_escolar=${encodeURIComponent(anySeleccionat)}`,
      { headers: { 'Authorization': `Bearer ${token()}` } }
    );
    const dades = await res.json();
    const dies  = dades.dies_especials || [];

    if (dies.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="taula-buit">Cap dia especial registrat.</td></tr>';
      return;
    }

    tbody.innerHTML = dies.map(d => `
      <tr>
        <td><code>${d.id_dia}</code></td>
        <td><strong>${d.nom_esdeveniment}</strong></td>
        <td>${ICONA_TIPUS[d.tipus] || ''} ${d.tipus}</td>
        <td>${d.data_inici}</td>
        <td>${d.data_fi}</td>
        <td>${d.grup
          ? `<span class="pill-dia">${d.grup}</span>`
          : '<span style="color:var(--text-clar)">Tot el centre</span>'}</td>
        <td>
          <button class="btn-eliminar"
            onclick="confirmarEliminacio('dia-especial', ${d.id_dia},
            '${d.nom_esdeveniment.replace(/'/g, "\\'")} (${d.data_inici})')">
            🗑 Eliminar
          </button>
        </td>
      </tr>
    `).join('');

  } catch {
    tbody.innerHTML =
      '<tr><td colspan="7" class="taula-buit">Error de connexió.</td></tr>';
  }
}