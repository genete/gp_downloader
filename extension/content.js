console.log('[GP] Content script cargado en:', location.href);

// Mantiene vivo el service worker mientras la pestaña esté abierta
chrome.runtime.connect({name: 'keepalive'});

// --- Lectura de fecha de la foto actual ---

const MESES_MAP = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12
};

function readPhotoDate() {
  // Formato esperado: "30 jun 2024" o "30 jun. 2024"
  const el = [...document.querySelectorAll('.R9U8ab')].find(e =>
    /^\d{1,2} [a-z]{3,5}\.? \d{4}$/i.test(e.textContent.trim())
  );
  if (!el) return null;
  // Eliminar punto del mes abreviado si lo tiene ("jun." → "jun")
  const parts = el.textContent.trim().toLowerCase().replace('.', '').split(' ');
  const [day, mon, year] = parts;
  const month = MESES_MAP[mon];
  if (!month) {
    console.warn('[GP] readPhotoDate: mes no reconocido:', mon, '— texto:', el.textContent.trim());
    return null;
  }
  return {year: parseInt(year), month, day: parseInt(day)};
}

// Reintenta leer la fecha hasta 5 segundos (el DOM puede tardar en renderizar)
function sendPhotoOpened(url, attempt = 0) {
  const date = readPhotoDate();
  if (date) {
    console.log(`[GP] PHOTO_OPENED — ${url} — fecha:`, date);
    sendToBackground({type: 'PHOTO_OPENED', photoUrl: url, date});
  } else if (attempt < 10) {
    setTimeout(() => sendPhotoOpened(url, attempt + 1), 500);
  } else {
    console.warn('[GP] PHOTO_OPENED — fecha no encontrada tras 5s:', url);
    sendToBackground({type: 'PHOTO_OPENED', photoUrl: url, date: null});
  }
}

// --- Detección de cambios de URL ---

let lastHref = location.href;
let debounceTimer = null;

function checkDomState() {
  if (location.href !== lastHref) {
    lastHref = location.href;
    if (location.href.includes('/photo/')) {
      sendPhotoOpened(location.href);
    }
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

  if (cmd.action === 'current_photo') {
    // El usuario ya tiene una foto abierta antes de que Python arrancara
    if (location.href.includes('/photo/')) {
      setTimeout(() => sendPhotoOpened(location.href), 500);
    }
    sendResponse({ok: true});
  }
  else if (cmd.action === 'download') {
    const start = Date.now();
    const tryDownload = () => {
      const moreBtn = [...document.querySelectorAll('button[aria-label="Más opciones"]')]
        .find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      if (moreBtn) {
        console.log('[GP] download: encontrado "Más opciones"');
        moreBtn.click();
        setTimeout(() => {
          const dl = [...document.querySelectorAll('[role="menuitem"]')]
            .find(el => el.textContent.includes('Descargar'));
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
        // Esperar a que renderice la info antes de leer la fecha
        setTimeout(() => sendPhotoOpened(location.href), 1500);
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
