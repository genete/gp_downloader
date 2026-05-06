// IDs de descargas creadas por nosotros (señales JSON) para ignorarlas en el monitor
const ownDownloadIds = new Set();

// Último nombre base descargado para detectar duplicado = fin de mes
let lastDownloadBasename = null;

// --- Escritura de señales JSON en ~/Downloads/ ---

// Escribe un archivo JSON en la carpeta de descargas del sistema.
// Python hace polling de estos archivos; los consume y los borra.
async function writeSignal(filename, data) {
  const payload = { ...data, ts: Date.now() };
  const json = JSON.stringify(payload, null, 2);

  // Codificación UTF-8 → base64 sin usar APIs del DOM (no disponibles en SW)
  const bytes = new TextEncoder().encode(json);
  const chars = Array.from(bytes, b => String.fromCodePoint(b)).join('');
  const b64 = btoa(chars);

  return new Promise(resolve => {
    chrome.downloads.download(
      {
        url: `data:application/json;base64,${b64}`,
        filename,
        saveAs: false,
        conflictAction: 'overwrite'
      },
      id => {
        ownDownloadIds.add(id);
        resolve(id);
      }
    );
  });
}

// --- Monitor de descargas reales (no señales) ---

chrome.downloads.onCreated.addListener(item => {
  if (ownDownloadIds.has(item.id)) return;
  console.log(`[GP] Descarga iniciada: ${item.filename}`);
});

chrome.downloads.onChanged.addListener(delta => {
  if (ownDownloadIds.has(delta.id)) return;
  if (!delta.state || delta.state.current !== 'complete') return;

  chrome.downloads.search({ id: delta.id }, ([item]) => {
    if (!item) return;

    const basename = item.filename.split(/[/\\]/).pop();
    const baseStem = stripChromeSuffix(basename);
    const prevStem = lastDownloadBasename ? stripChromeSuffix(lastDownloadBasename) : null;

    // Mismo archivo descargado dos veces = hemos llegado al final del mes
    const duplicate = prevStem !== null && baseStem === prevStem;
    lastDownloadBasename = basename;

    console.log(`[GP] Descarga completa: ${basename}${duplicate ? ' ⚠ DUPLICADO (fin de mes)' : ''}`);

    writeSignal('gp_signal_download_done.json', {
      filename: item.filename,
      basename,
      duplicate
    });
  });
});

// Quita el sufijo que Chrome añade a descargas duplicadas: "foto (1).jpg" → "foto.jpg"
function stripChromeSuffix(name) {
  return name.replace(/ \(\d+\)(\.[^.]+)$/, '$1').replace(/ \(\d+\)$/, '');
}

// --- Mensajes desde content.js ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'DOM_STATE') {
    if (msg.noResults) {
      console.log('[GP] DOM: sin resultados detectado');
      writeSignal('gp_signal_no_results.json', { noResults: true, url: msg.url });
    } else {
      // Solo loguear; Python asume "hay resultados" si no llega gp_signal_no_results
      console.log('[GP] DOM: resultados presentes');
    }
  }

  if (msg.type === 'KEYDOWN' && msg.interesting) {
    console.log(`[GP] Tecla interesante: ${msg.label}`);
    // En esta fase las teclas las genera el usuario a mano.
    // Más adelante Python leerá gp_signal_download_done y enviará teclas vía AHK.
  }

  sendResponse({ ok: true });
});
