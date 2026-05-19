const PYTHON = 'http://127.0.0.1:8765';

const ownDownloadIds  = new Set();
const downloadPhotoUrl = new Map();

// Sesión CDP persistente — evita attach/detach en cada tecla
let _cdpTabId = null;

// --- Señales hacia Python ---

async function sendSignal(type, data = {}) {
  try {
    await fetch(`${PYTHON}/signal`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({type, ...data})
    });
  } catch (_) {}
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
    await sleep(50);  // era 200ms — reduce latencia de comandos
  }
}

async function executeCommand(cmd) {
  console.log('[GP] Comando:', cmd.action);
  // Buscar la pestaña de Google Fotos; si no, usar la activa
  const gpTabs = await chrome.tabs.query({url: 'https://photos.google.com/*'});
  const [tab] = gpTabs.length > 0 ? gpTabs : await chrome.tabs.query({active: true, lastFocusedWindow: true});
  if (!tab) return;

  if (cmd.action === 'navigate') {
    console.log(`[GP] navigate → ${cmd.url}`);
    await cdpDetach();  // la navegación invalida la sesión actual
    await chrome.tabs.update(tab.id, {url: cmd.url});
    await sleep(5000);  // espera generosa: la foto debe estar cargada antes de 'i'
    await cdpKey(tab.id, 'i', 'KeyI', 73);
    return;
  }

  if (cmd.action === 'open_first') {
    await openFirstPhoto(tab.id);
    return;
  }

  if (cmd.action === 'download') {
    await cdpKey(tab.id, 'D', 'KeyD', 68, true);  // Shift+D
    return;
  }

  if (cmd.action === 'next') {
    await cdpKey(tab.id, 'ArrowRight', 'ArrowRight', 39);
    return;
  }

  if (cmd.action === 'open_info') {
    await cdpKey(tab.id, 'i', 'KeyI', 73);
    return;
  }

  // back → content.js
  chrome.tabs.sendMessage(tab.id, cmd).catch(e => {
    console.warn('[GP] sendMessage error:', e.message);
  });
}

// --- CDP: sesión persistente ---

async function cdpAttach(tabId) {
  if (_cdpTabId === tabId) return;
  await cdpDetach();
  await chrome.debugger.attach({tabId}, '1.3');
  _cdpTabId = tabId;
}

async function cdpDetach() {
  if (_cdpTabId === null) return;
  try { await chrome.debugger.detach({tabId: _cdpTabId}); } catch (_) {}
  _cdpTabId = null;
}

async function cdpKey(tabId, key, code, keyCode, shiftKey = false) {
  // Reintentar una vez si la sesión se perdió (p.ej. tras navegación)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await cdpAttach(tabId);
      const modifiers = shiftKey ? 8 : 0;
      if (shiftKey) {
        await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
          {type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16});
      }
      await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
        {type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers});
      await sleep(20);  // era 50ms
      await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
        {type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers});
      if (shiftKey) {
        await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
          {type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16});
      }
      return;  // éxito — sesión sigue abierta
    } catch (e) {
      console.warn(`[GP] cdpKey intento ${attempt + 1} fallido:`, e.message);
      _cdpTabId = null;
      try { await chrome.debugger.detach({tabId}); } catch (_) {}
    }
  }
  console.error('[GP] cdpKey: falló tras 2 intentos');
}

// --- Monitor de descargas ---

chrome.downloads.onCreated.addListener(async item => {
  if (ownDownloadIds.has(item.id)) return;
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  downloadPhotoUrl.set(item.id, tab?.url ?? '');
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
  if (msg.type === 'PHOTO_OPENED')
    sendSignal('photo_opened', {photoUrl: msg.photoUrl, date: msg.date ?? null});
  sendResponse({ok: true});
});

// --- Abrir primera foto (solo en inicio de sesión) ---

async function openFirstPhoto(tabId) {
  console.log('[GP] openFirstPhoto: Tab hasta foto + Enter');
  try {
    await cdpAttach(tabId);
    for (let i = 0; i < 15; i++) {
      await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
        {type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9});
      await sleep(20);
      await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
        {type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
      await sleep(80);
      const {result} = await chrome.debugger.sendCommand({tabId}, 'Runtime.evaluate', {
        expression: `document.activeElement?.href?.includes('/photo/') ?? false`,
        returnByValue: true
      });
      if (result.value === true) {
        console.log(`[GP] openFirstPhoto: foto enfocada tras ${i + 1} Tab(s)`);
        break;
      }
    }
    await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
      {type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13});
    await sleep(20);
    await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
      {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13});
    // Abrir panel de info — queda abierto en todas las fotos siguientes
    await sleep(1200);
    await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
      {type: 'keyDown', key: 'i', code: 'KeyI', windowsVirtualKeyCode: 73, nativeVirtualKeyCode: 73});
    await sleep(20);
    await chrome.debugger.sendCommand({tabId}, 'Input.dispatchKeyEvent',
      {type: 'keyUp', key: 'i', code: 'KeyI', windowsVirtualKeyCode: 73, nativeVirtualKeyCode: 73});
    // Sesión CDP sigue abierta para los comandos siguientes
    console.log('[GP] openFirstPhoto: completado');
  } catch (e) {
    console.error('[GP] openFirstPhoto error:', e.message);
    _cdpTabId = null;
    try { await chrome.debugger.detach({tabId}); } catch (_) {}
  }
}

// Keepalive
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'keepalive') console.log('[GP] Keepalive conectado');
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

pollCommands();
