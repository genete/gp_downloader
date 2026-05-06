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

function scheduleMasCheck(delayMs) {
  clearTimeout(masTimer);
  masTimer = setTimeout(doMasCheck, delayMs);
}

function doMasCheck() {
  masTimer = null;
  if (!location.href.includes('/search/') || location.href.includes('/photo/')) return;

  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (el.textContent.trim() === 'Más') {
      el.click();
      console.log('[GP] Botón "Más" pulsado — esperando siguiente lote...');
      scheduleMasCheck(2500);  // esperar a que cargue el siguiente lote
      return;
    }
  }

  // No hay botón "Más" → todos los resultados están cargados
  masActive = false;
  console.log('[GP] SEARCH_READY —', location.href);
  sendToBackground({ type: 'SEARCH_READY', url: location.href });
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
  if (inSearch && !masActive) {
    masActive = true;
    scheduleMasCheck(600);  // primera comprobación tras estabilizar el DOM inicial
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
