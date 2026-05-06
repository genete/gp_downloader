// IDs de descargas creadas por nosotros (señales JSON) para ignorarlas en el monitor
const ownDownloadIds = new Set();

// URL de Google Fotos en el momento de iniciar cada descarga (id → url)
const downloadPhotoUrl = new Map();

// --- Escritura de señales JSON en ~/Downloads/ ---

// Escribe un archivo JSON en la carpeta de descargas del sistema.
// El nombre lleva timestamp para que cada señal sea un archivo único.
// Python (watchdog) reacciona al evento de creación, lo lee y lo borra.
async function writeSignal(type, data) {
  const filename = `gp_signals/gp_signal_${type}_${Date.now()}.json`;
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
        conflictAction: 'uniquify'
      },
      id => {
        ownDownloadIds.add(id);
        resolve(id);
      }
    );
  });
}

// --- Monitor de descargas reales (no señales) ---

chrome.downloads.onCreated.addListener(async item => {
  if (ownDownloadIds.has(item.id)) return;

  // Capturar la URL de la foto en el momento del SHIFT+D (antes de que navegue)
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const photoUrl = tab?.url ?? '';
  downloadPhotoUrl.set(item.id, photoUrl);

  console.log(`[GP] Descarga iniciada (id=${item.id}) url=${photoUrl}`);
});

chrome.downloads.onChanged.addListener(delta => {
  if (ownDownloadIds.has(delta.id)) return;
  if (!delta.state || delta.state.current !== 'complete') return;

  chrome.downloads.search({ id: delta.id }, ([item]) => {
    if (!item) return;

    const basename = item.filename.split(/[/\\]/).pop();
    const photoUrl = downloadPhotoUrl.get(delta.id) ?? '';
    downloadPhotoUrl.delete(delta.id);

    console.log(`[GP] Descarga completa: ${basename} url=${photoUrl}`);

    writeSignal('download_done', {
      filename: item.filename,   // ruta completa con el nombre que dio Chrome
      basename,
      photoUrl                   // URL única de la foto → Python detecta fin de mes
    });
  });
});

// --- Mensajes desde content.js ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'DOM_STATE' && msg.noResults) {
    console.log('[GP] DOM: sin resultados detectado');
    writeSignal('no_results', { noResults: true, url: msg.url });
  }

  if (msg.type === 'SEARCH_READY') {
    console.log('[GP] Búsqueda lista — todos los resultados cargados');
    writeSignal('search_ready', { url: msg.url });
  }

  if (msg.type === 'KEYDOWN' && msg.interesting) {
    console.log(`[GP] Tecla interesante: ${msg.label}`);
  }

  sendResponse({ ok: true });
});
