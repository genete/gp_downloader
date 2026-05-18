const PYTHON = 'http://127.0.0.1:8765';

const ownDownloadIds  = new Set();
const downloadPhotoUrl = new Map();

// --- Señales hacia Python ---

async function sendSignal(type, data = {}) {
  try {
    await fetch(`${PYTHON}/signal`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({type, ...data})
    });
  } catch (_) {
    // Python aún no está corriendo
  }
}

// --- Polling de comandos desde Python ---

async function pollCommands() {
  while (true) {
    try {
      const resp = await fetch(`${PYTHON}/command`);
      if (resp.ok) {
        const cmd = await resp.json();
        if (cmd.action && cmd.action !== 'idle') {
          await executeCommand(cmd);
        }
      }
    } catch (_) {
      await sleep(1000);
    }
    await sleep(200);
  }
}

async function executeCommand(cmd) {
  console.log('[GP] Comando:', cmd.action);

  if (cmd.action === 'search') {
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    if (tab) {
      const url = `https://photos.google.com/search/${encodeURIComponent(cmd.query)}`;
      await chrome.tabs.update(tab.id, {url});
    }
    return;
  }

  // open_first / download / next / back → content.js
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  if (tab) {
    chrome.tabs.sendMessage(tab.id, cmd).catch(e => {
      console.warn('[GP] sendMessage error:', e.message);
    });
  }
}

// --- Monitor de descargas reales ---

chrome.downloads.onCreated.addListener(async item => {
  if (ownDownloadIds.has(item.id)) return;
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  const photoUrl = tab?.url ?? '';
  downloadPhotoUrl.set(item.id, photoUrl);
  console.log(`[GP] Descarga iniciada (id=${item.id}) url=${photoUrl}`);
});

chrome.downloads.onChanged.addListener(delta => {
  if (ownDownloadIds.has(delta.id)) return;
  if (!delta.state || delta.state.current !== 'complete') return;

  chrome.downloads.search({id: delta.id}, ([item]) => {
    if (!item) return;
    const basename = item.filename.split(/[/\\]/).pop();
    const photoUrl = downloadPhotoUrl.get(delta.id) ?? '';
    downloadPhotoUrl.delete(delta.id);
    console.log(`[GP] Descarga completa: ${basename}`);
    sendSignal('download_done', {filename: item.filename, basename, photoUrl});
  });
});

// --- Mensajes desde content.js ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SEARCH_READY')
    sendSignal('search_ready', {url: msg.url});
  if (msg.type === 'DOM_STATE' && msg.noResults)
    sendSignal('no_results', {url: msg.url});
  if (msg.type === 'PHOTO_OPENED')
    sendSignal('photo_opened', {photoUrl: msg.photoUrl});
  sendResponse({ok: true});
});

// Keepalive: content.js abre un puerto que mantiene vivo el service worker
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'keepalive') {
    console.log('[GP] Keepalive conectado');
  }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

pollCommands();
