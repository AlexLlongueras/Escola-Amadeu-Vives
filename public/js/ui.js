// public/js/ui.js
// Funcions d'UI compartides entre main.js i admin.js
// Requereix SweetAlert2 carregat prèviament al HTML.

'use strict';

// ─── SweetAlert2 preconfigurats ───────────────────────────────────────────────

const Swal2 = {

  // Toast lleuger a la cantonada (èxit, error, info)
  toast(missatge, icon = 'success') {
    Swal.fire({
      toast:             true,
      position:          'bottom-end',
      icon,
      title:             missatge,
      showConfirmButton: false,
      timer:             3500,
      timerProgressBar:  true,
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      },
    });
  },

  // Toast d'èxit
  ok(missatge)   { this.toast(missatge, 'success'); },

  // Toast d'error
  err(missatge)  { this.toast(missatge, 'error');   },

  // Toast d'advertència
  warn(missatge) { this.toast(missatge, 'warning'); },

  // Modal de confirmació destructiva (per a eliminacions)
  async confirmar({ titol, text, btnConfirmar = 'Sí, eliminar', btnCancel = 'Cancel·lar' }) {
    const result = await Swal.fire({
      title:              titol,
      text,
      icon:               'warning',
      showCancelButton:   true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor:  '#6b7280',
      confirmButtonText:  btnConfirmar,
      cancelButtonText:   btnCancel,
      reverseButtons:     true,
    });
    return result.isConfirmed;
  },

  // Modal d'error amb detall (per a solapaments amb llista de conflictes)
  errorDetallat(titol, conflictes = []) {
    Swal.fire({
      title:             titol,
      icon:              'error',
      html: conflictes.length > 0
        ? '<ul style="text-align:left;margin:0;padding-left:1.2rem">' +
          conflictes.map(c => `<li style="margin-bottom:.4rem">${c}</li>`).join('') +
          '</ul>'
        : '',
      confirmButtonColor: '#2563a8',
    });
  },
};

// ─── Spinner de càrrega ───────────────────────────────────────────────────────

const Spinner = {
  // Afegeix un spinner dins d'un botó i el desactiva
  activar(boto, text = 'Processant...') {
    boto.disabled         = true;
    boto._textOriginal    = boto.innerHTML;
    boto.innerHTML        = `
      <span style="display:inline-flex;align-items:center;gap:.5rem">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5"
             style="animation:girar .7s linear infinite">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83
                   M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        ${text}
      </span>`;
  },

  // Restaura el botó a l'estat original
  desactivar(boto) {
    boto.disabled  = false;
    boto.innerHTML = boto._textOriginal || boto.innerHTML;
  },
};

// Afegim l'animació del spinner al document una sola vegada
const styleSpinner = document.createElement('style');
styleSpinner.textContent = '@keyframes girar { to { transform: rotate(360deg); } }';
document.head.appendChild(styleSpinner);

// ─── Spinner de pàgina sencera (mentre carreguen les dades inicials) ─────────

const SpinnerPagina = {
  mostrar(contenidor, text = 'Carregant dades...') {
    contenidor.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;
                  justify-content:center;padding:3rem;gap:1rem;color:#4a5f7a">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
             stroke="#2563a8" stroke-width="2"
             style="animation:girar .8s linear infinite">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83
                   M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <span style="font-size:.88rem">${text}</span>
      </div>`;
  },
};