# gp_downloader — Contexto para Claude Code

## Descripción del proyecto

Sistema autónomo de descarga masiva de fotos y vídeos desde Google Fotos. El sistema combina una extensión de Chrome, un orquestador en Python y automatización de teclado con AutoHotkey (AHK).

## Arquitectura

### Componentes principales

1. **Extensión de Chrome** (`extension/`)
   - Lee el DOM de Google Fotos para detectar elementos multimedia
   - Controla el estado de la navegación (scroll, selección, descarga)
   - Escribe archivos JSON de señalización en `~/Downloads/` para comunicarse con Python
   - Alternativa en estudio: Native Messaging (la extensión actúa como host que despierta a Python)

2. **Orquestador Python** (`orchestrator/`)
   - Dirige el flujo de descarga desde fuera de Chrome
   - Lee los JSON de señalización generados por la extensión
   - Coordina la lógica de reintentos, deduplicación y progreso
   - Alternativa en estudio: actuar como Native Messaging host (Python recibe mensajes directamente de la extensión sin archivos intermedios)

3. **Automatización AHK** (`ahk/`)
   - Envía combinaciones de teclas al navegador para acciones que no se pueden hacer desde JS (ej. activar el diálogo de descarga del sistema)
   - Actúa como puente de bajo nivel cuando la extensión no puede disparar eventos nativos del sistema

### Flujo de comunicación actual (JSON en disco)

```
Chrome (extensión)  →  ~/Downloads/gp_signal_*.json  →  Python (orquestador)
Python              →  ~/Downloads/gp_cmd_*.json      →  Chrome (extensión lee en polling)
Python              →  AHK script                     →  Chrome (teclas del sistema)
```

### Alternativa en estudio: Native Messaging

```
Chrome (extensión)  ←→  Python (native messaging host)
```
- La extensión se comunica con Python mediante stdin/stdout
- Elimina la necesidad de archivos JSON intermedios
- Python debe estar registrado como host en el registro de Windows / manifiesto de NM
- **Tarea pendiente**: evaluar complejidad de implementación vs. beneficio

## Estructura de directorios (objetivo)

```
gp_downloader/
├── extension/          # Extensión de Chrome (Manifest V3)
│   ├── manifest.json
│   ├── background.js   # Service worker
│   ├── content.js      # Lectura del DOM de Google Fotos
│   └── popup/
├── orchestrator/       # Orquestador Python
│   ├── main.py
│   ├── watcher.py      # Monitoriza los JSON de señalización
│   └── downloader.py
├── ahk/                # Scripts AutoHotkey
│   └── send_keys.ahk
├── native_messaging/   # (en estudio) Host para Native Messaging
│   └── host.py
└── CLAUDE.md
```

## Convenciones

- Python 3.11+, sin dependencias pesadas si se puede evitar
- Extensión en Manifest V3 (sin background pages persistentes, usar service worker)
- Los archivos JSON de señalización usan el prefijo `gp_` y se eliminan tras ser consumidos
- Logs en español en consola; código y nombres de variables en inglés
- No usar librerías de scraping externas en la extensión (solo APIs del navegador)

## Decisiones pendientes / en estudio

- [ ] Evaluar Native Messaging vs. JSON en disco: complejidad, latencia, robustez
- [ ] Estrategia de scroll y detección de fin de galería
- [ ] Manejo de rate limiting de Google Fotos
- [ ] Deduplicación por hash o por nombre de archivo

## Comandos útiles (cuando el proyecto avance)

```bash
# Instalar dependencias Python
pip install -r requirements.txt

# Cargar la extensión en Chrome (modo desarrollador)
# chrome://extensions → "Cargar descomprimida" → seleccionar extension/

# Ejecutar el orquestador
python orchestrator/main.py
```
