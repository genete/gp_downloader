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

  if (cmd.action === 'navigate') {
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    if (tab) {
      console.log(`[GP] navigate → ${cmd.url}`);
      await chrome.tabs.update(tab.id, {url: cmd.url});
    }
    return;
  }

  if (cmd.action === 'open_first') {
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    if (tab) await openFirstPhoto(tab.id);
    return;
  }

  // download / next / back → content.js
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEARCH_READY')
    sendSignal('search_ready', {url: msg.url});
  if (msg.type === 'DOM_STATE' && msg.noResults)
    sendSignal('no_results', {url: msg.url});
  if (msg.type === 'PHOTO_OPENED')
    sendSignal('photo_opened', {photoUrl: msg.photoUrl});
  if (msg.type === 'NO_MORE_PHOTOS')
    sendSignal('no_more_photos', {});
  if (msg.type === 'TRUSTED_CLICK') {
    console.log(`[GP] TRUSTED_CLICK recibido en (${msg.x}, ${msg.y}), tab=${sender.tab?.id}`);
    trustedClick(sender.tab.id, msg.x, msg.y);
  }
  sendResponse({ok: true});
});

async function openFirstPhoto(tabId) {
  console.log('[GP] openFirstPhoto: Tab hasta foto + Enter');
  try {
    await chrome.debugger.attach({tabId}, '1.3');
    // Tab hasta que el elemento activo sea un enlace a foto (máx 15 tabs)
    for (let i = 0; i < 15; i++) {
      await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
        {type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9});
      await sleep(30);
      await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
        {type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
      await sleep(120);
      const {result} = await chrome.debugger.sendCommand({tabId}, 'Runtime.evaluate', {
        expression: `document.activeElement?.href?.includes('/photo/') ?? false`,
        returnByValue: true
      });
      if (result.value === true) {
        console.log(`[GP] openFirstPhoto: foto enfocada tras ${i + 1} Tab(s)`);
        break;
      }
    }
    // Enter para abrir la foto
    for (const type of ['keyDown', 'keyUp']) {
      await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
        {type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13});
      await sleep(50);
    }
    await chrome.debugger.detach({tabId});
    console.log('[GP] openFirstPhoto: completado');
  } catch (e) {
    console.error('[GP] openFirstPhoto error:', e.message);
    try { await chrome.debugger.detach({tabId}); } catch (_) {}
  }
}

async function trustedClick(tabId, x, y) {
  console.log(`[GP] trustedClick: iniciando attach a tab ${tabId}`);
  try {
    await chrome.debugger.attach({tabId}, '1.3');
    console.log('[GP] trustedClick: attach OK');
    await sleep(100);
    await chrome.debugger.sendCommand({tabId}, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1
    });
    console.log('[GP] trustedClick: mousePressed OK');
    await sleep(50);
    await chrome.debugger.sendCommand({tabId}, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0
    });
    console.log('[GP] trustedClick: mouseReleased OK');
    await chrome.debugger.detach({tabId});
    console.log(`[GP] trustedClick: COMPLETADO en (${x}, ${y})`);
  } catch (e) {
    console.error('[GP] trustedClick ERROR:', e.message);
    try { await chrome.debugger.detach({tabId}); } catch (_) {}
  }
}

// Keepalive: content.js abre un puerto que mantiene vivo el service worker
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'keepalive') {
    console.log('[GP] Keepalive conectado');
  }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

pollCommands();
