console.log('[GP] Content script cargado en:', location.href);

const NO_RESULTS_STRINGS = [
  'Sin resultados',
  'Prueba con una palabra clave sinónima o más general'
];

// --- Detección de estado del DOM ---

let debounceTimer = null;

function checkDomState() {
  const text = document.body.innerText;
  const noResults = NO_RESULTS_STRINGS.some(s => text.includes(s));

  // Solo actuar en la vista de resultados de búsqueda (no en foto individual)
  const inSearch = location.href.includes('/search/') && !location.href.includes('/photo/');

  if (inSearch && !noResults) {
    if (tryClickMas()) {
      // Hay botón "Más" → lo pulsamos; el MutationObserver volverá a disparar
      // cuando carguen los nuevos resultados
      return;
    }
    // Sin botón "Más" y sin "sin resultados" → todos los resultados están cargados
    sendToBackground({ type: 'SEARCH_READY', url: location.href });
  }

  sendToBackground({ type: 'DOM_STATE', noResults, url: location.href });
}

// Pulsa el botón "Más" si está presente en la página
function tryClickMas() {
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (el.textContent.trim() === 'Más') {
      el.click();
      console.log('[GP] Botón "Más" pulsado — esperando más resultados...');
      return true;
    }
  }
  return false;
}

// Debounce: 1000ms para dar tiempo a que carguen los nuevos resultados tras "Más"
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(checkDomState, 1000);
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

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
