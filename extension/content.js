// Confirmación de que el script se ha inyectado correctamente (visible en F12 de la pestaña)
console.log('[GP] Content script cargado en:', location.href);

// Cadenas que Google Fotos muestra cuando una búsqueda no tiene resultados.
// Hay que confirmar experimentalmente que nunca aparecen con resultados presentes.
const NO_RESULTS_STRINGS = [
  'Sin resultados',
  'Prueba con una palabra clave sinónima o más general'
];

// --- Detección de "sin resultados" en el DOM ---

let debounceTimer = null;

function checkDomState() {
  const text = document.body.innerText;
  const noResults = NO_RESULTS_STRINGS.some(s => text.includes(s));
  sendToBackground({ type: 'DOM_STATE', noResults, url: location.href });
}

// Debounce: espera 600ms tras el último cambio para evitar spam de mensajes
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(checkDomState, 600);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});

// Comprobación inicial al cargar el script
setTimeout(checkDomState, 1500);

// --- Captura de teclado ---

// Teclas de interés para el flujo de descarga
const INTERESTING_KEYS = new Set([
  'Enter', 'Escape', 'ArrowRight', 'ArrowLeft', 'd', 'D', '/'
]);

document.addEventListener('keydown', (e) => {
  const label = formatKey(e);
  console.log(`[GP] Tecla: ${label}`);
  sendToBackground({
    type: 'KEYDOWN',
    key: e.key,
    code: e.code,
    shift: e.shiftKey,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    label,
    interesting: INTERESTING_KEYS.has(e.key),
    ts: Date.now()
  });
}, true); // capture phase para ver la tecla antes de que la consuma la página

function formatKey(e) {
  const mods = [
    e.ctrlKey  && 'CTRL',
    e.shiftKey && 'SHIFT',
    e.altKey   && 'ALT'
  ].filter(Boolean);
  return [...mods, e.key].join('+');
}

// --- Comunicación con el background ---

function sendToBackground(msg) {
  try {
    // chrome.runtime.id es null cuando el contexto fue invalidado (extensión recargada)
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch (_) {
    // Contexto invalidado: recargar la página restaura la conexión
  }
}
