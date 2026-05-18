console.log('[GP] Content script cargado en:', location.href);

// Mantiene vivo el service worker mientras la pestaña esté abierta
chrome.runtime.connect({name: 'keepalive'});

const NO_RESULTS_STRINGS = [
  'Sin resultados',
  'Prueba con una palabra clave sinónima o más general'
];

// --- Ciclo de clic en "Más" ---

let masTimer = null;
let masActive = false;
let masClicks = 0;
let searchReadySentFor = '';
const MAS_MAX_CLICKS = 50;

function scheduleMasCheck(delayMs) {
  clearTimeout(masTimer);
  masTimer = setTimeout(doMasCheck, delayMs);
}

function doMasCheck() {
  masTimer = null;
  if (!location.href.includes('/search/')) return;
  if (location.href.includes('/photo/')) return;

  if (masClicks >= MAS_MAX_CLICKS) {
    console.warn('[GP] Límite de clics en "Más" — forzando SEARCH_READY');
    masActive = false;
    sendToBackground({type: 'SEARCH_READY', url: location.href});
    return;
  }

  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (el.textContent.trim() !== 'Más') continue;
    if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
    masClicks++;
    el.click();
    console.log(`[GP] "Más" pulsado (${masClicks})`);
    scheduleMasCheck(2500);
    return;
  }

  masActive = false;
  masClicks = 0;
  if (searchReadySentFor !== location.href) {
    searchReadySentFor = location.href;
    console.log('[GP] SEARCH_READY —', location.href);
    sendToBackground({type: 'SEARCH_READY', url: location.href});
  }
}

// --- Detección de cambios DOM y URL ---

let debounceTimer = null;
let lastHref = location.href;

function checkDomState() {
  // Detectar navegación SPA (cambio de URL sin recarga de página)
  if (location.href !== lastHref) {
    lastHref = location.href;
    if (location.href.includes('/photo/')) {
      console.log('[GP] PHOTO_OPENED —', location.href);
      sendToBackground({type: 'PHOTO_OPENED', photoUrl: location.href});
    }
  }

  const text = document.body.innerText;
  if (NO_RESULTS_STRINGS.some(s => text.includes(s))) {
    sendToBackground({type: 'DOM_STATE', noResults: true, url: location.href});
    return;
  }

  const inSearch = location.href.includes('/search/') && !location.href.includes('/photo/');
  if (inSearch && !masActive && searchReadySentFor !== location.href) {
    masActive = true;
    scheduleMasCheck(3000);
  }
}

const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(checkDomState, 300);
});

observer.observe(document.body, {childList: true, subtree: true});
setTimeout(checkDomState, 1500);

// --- Comandos desde background.js ---

chrome.runtime.onMessage.addListener((cmd, _sender, sendResponse) => {
  console.log('[GP] Comando:', cmd.action);

  if (cmd.action === 'open_first') {
    const first = document.querySelector('a[href*="/photo/"]');
    if (first) {
      first.click();
      sendResponse({ok: true});
    } else {
      console.warn('[GP] open_first: no hay fotos en el DOM');
      sendResponse({ok: false});
    }
  }
  else if (cmd.action === 'download') {
    const moreBtn = [...document.querySelectorAll('button[aria-label="Más opciones"]')]
      .find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    if (moreBtn) {
      moreBtn.click();
      setTimeout(() => {
        const dl = [...document.querySelectorAll('[role="menuitem"]')]
          .find(el => el.textContent.includes('Descargar'));
        dl?.click();
      }, 400);
      sendResponse({ok: true});
    } else {
      console.warn('[GP] download: no se encontró "Más opciones"');
      sendResponse({ok: false});
    }
  }
  else if (cmd.action === 'next') {
    document.querySelector('[aria-label="Ver la foto siguiente"]')?.click();
    sendResponse({ok: true});
  }
  else if (cmd.action === 'back') {
    history.back();
    sendResponse({ok: true});
  }

  return true;
});

// --- Comunicación con background.js ---

function sendToBackground(msg) {
  try {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch (_) {}
}
