console.log('[GP] Content script cargado en:', location.href);

const NO_RESULTS_STRINGS = [
  'Sin resultados',
  'Prueba con una palabra clave sinónima o más general'
];

// --- Ciclo independiente de clic en "Más" ---
// Usa su propio timer, no se ve afectado por las mutaciones del DOM
// causadas por la carga perezosa de miniaturas.

let masTimer = null;
let masActive = false;
let masClicks = 0;
let searchReadySentFor = '';   // evita enviar SEARCH_READY varias veces para la misma URL
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
    console.warn('[GP] Límite de clics en "Más" alcanzado — forzando SEARCH_READY');
    masActive = false;
    sendToBackground({ type: 'SEARCH_READY', url: location.href });
    return;
  }

  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (el.textContent.trim() !== 'Más') continue;
    // Ignorar elementos ocultos (display:none, visibility:hidden, fuera del flujo)
    if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
    masClicks++;
    el.click();
    console.log(`[GP] "Más" pulsado (${masClicks}) — esperando siguiente lote...`);
    scheduleMasCheck(2500);
    return;
  }

  // No hay botón "Más" → todos los resultados cargados
  masActive = false;
  masClicks = 0;
  if (searchReadySentFor !== location.href) {
    searchReadySentFor = location.href;
    console.log('[GP] SEARCH_READY —', location.href);
    sendToBackground({ type: 'SEARCH_READY', url: location.href });
  }
}

// --- Detección de "sin resultados" y arranque del ciclo "Más" ---

let debounceTimer = null;

function checkDomState() {
  const text = document.body.innerText;
  const noResults = NO_RESULTS_STRINGS.some(s => text.includes(s));

  if (noResults) {
    sendToBackground({ type: 'DOM_STATE', noResults: true, url: location.href });
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

observer.observe(document.body, { childList: true, subtree: true });

setTimeout(checkDomState, 1500);

// --- Captura de teclado ---

const INTERESTING_KEYS = new Set(['Enter', 'Escape', 'ArrowRight', 'ArrowLeft', 'd', 'D', '/']);

document.addEventListener('keydown', (e) => {
  const label = formatKey(e);
  console.log(`[GP] Tecla: ${label}`);
  sendToBackground({
    type: 'KEYDOWN',
    key: e.key, code: e.code,
    shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey,
    label, interesting: INTERESTING_KEYS.has(e.key), ts: Date.now()
  });
}, true);

function formatKey(e) {
  const mods = [e.ctrlKey && 'CTRL', e.shiftKey && 'SHIFT', e.altKey && 'ALT'].filter(Boolean);
  return [...mods, e.key].join('+');
}

// --- Comunicación con el background ---

function sendToBackground(msg) {
  try {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch (_) {}
}
