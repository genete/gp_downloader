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
let noMasRetries = 0;
let searchReadySentFor = '';
const MAS_MAX_CLICKS = 50;
// Reintentos esperando que aparezca el botón "Más" o la URL /relevance (lazy loading)
const NO_MAS_MAX_RETRIES = 6;  // 6 × 1000ms = 6s de espera máxima

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
    noMasRetries = 0;
    masClicks++;
    console.log(`[GP] URL antes de "Más": ${location.href}`);
    // Scroll al botón para que esté en el viewport antes de obtener coordenadas
    el.scrollIntoView({behavior: 'instant', block: 'center'});
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      console.log(`[GP] "Más" pulsado (${masClicks}) en viewport (${x}, ${y})`);
      sendToBackground({type: 'TRUSTED_CLICK', x, y});
      setTimeout(() => console.log(`[GP] URL tras "Más": ${location.href}`), 1500);
    }, 300);
    scheduleMasCheck(2500 + 300);
    return;
  }

  // No hay botón "Más". Si nunca lo pulsamos y no estamos en /relevance,
  // puede que el DOM aún no haya cargado el botón — esperamos un poco más.
  if (masClicks === 0 && !location.href.includes('/relevance') && noMasRetries < NO_MAS_MAX_RETRIES) {
    noMasRetries++;
    console.log(`[GP] Sin "Más" aún, reintentando (${noMasRetries}/${NO_MAS_MAX_RETRIES})...`);
    scheduleMasCheck(1000);
    return;
  }

  noMasRetries = 0;
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
    // Después de búsqueda+Enter la primera foto tiene foco de teclado — simulamos Enter
    const active = document.activeElement;
    const target = (active?.href?.includes('/photo/')) ? active
                 : document.querySelector('a[href*="/photo/"]');
    if (target) {
      target.focus();
      target.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', keyCode: 13, bubbles: true}));
      target.dispatchEvent(new KeyboardEvent('keyup',  {key: 'Enter', keyCode: 13, bubbles: true}));
      target.click();  // fallback por si Enter no abre
      sendResponse({ok: true});
    } else {
      console.warn('[GP] open_first: no hay fotos en el DOM');
      sendResponse({ok: false});
    }
  }
  else if (cmd.action === 'download') {
    const allBtns = document.querySelectorAll('button');
    const candidates = [...allBtns].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    console.log('[GP] download: botones visibles en DOM:', candidates.map(b => b.getAttribute('aria-label') || b.textContent.trim()).join(' | '));

    const start = Date.now();
    const tryDownload = () => {
      const moreBtn = [...document.querySelectorAll('button[aria-label="Más opciones"]')]
        .find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      if (moreBtn) {
        console.log('[GP] download: encontrado "Más opciones", haciendo click');
        moreBtn.click();
        setTimeout(() => {
          const items = [...document.querySelectorAll('[role="menuitem"]')];
          console.log('[GP] download: menuitems:', items.map(el => el.textContent.trim()).join(' | '));
          const dl = items.find(el => el.textContent.includes('Descargar'));
          dl?.click();
        }, 400);
      } else if (Date.now() - start < 6000) {
        setTimeout(tryDownload, 200);
      } else {
        console.warn('[GP] download: timeout — "Más opciones" no apareció en 6s');
      }
    };
    tryDownload();
    sendResponse({ok: true});
  }
  else if (cmd.action === 'next') {
    const prevUrl = location.href;
    document.querySelector('[aria-label="Ver la foto siguiente"]')?.click();
    const check = setInterval(() => {
      if (location.href !== prevUrl && location.href.includes('/photo/')) {
        clearInterval(check);
        sendToBackground({type: 'PHOTO_OPENED', photoUrl: location.href});
      }
    }, 100);
    setTimeout(() => clearInterval(check), 8000);
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
