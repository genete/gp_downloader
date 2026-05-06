# gp_downloader — Contexto para Claude Code

## Descripción del proyecto

Sistema autónomo de descarga masiva de ~35.000 fotos y vídeos desde Google Fotos.
Simula comportamiento humano (pulsaciones de tecla una a una, con esperas naturales)
para no incumplir los TOS de Google Fotos ni levantar alertas por descargas masivas en paralelo.

## Método de descarga

El usuario tiene Google Fotos abierto y logueado en Chrome. El sistema automatiza:

### Flujo por mes/año

```
1. Enfocar la barra de búsqueda:  /
2. Seleccionar texto anterior:    CTRL+A
3. Escribir "mes año":            e.g. "enero 2018"
4. Confirmar búsqueda:            ENTER
5. [Extensión] ¿Hay resultados?
   - NO → pasar al siguiente mes/año
   - SÍ → el primer item queda enfocado automáticamente → bucle de descarga
```

### Bucle de descarga (por item)

```
ENTER          → abre el item en vista detalle
SHIFT+D        → descarga el item actual
[Python espera a que el archivo aparezca en ~/Downloads/]
RIGHT-ARROW    → avanza al siguiente item
SHIFT+D        → descarga
[Python espera...]
...

Condición de fin de mes: cuando se descarga el mismo archivo dos veces
(Google Fotos vuelve al primer item al llegar al final del mes).
→ ESC          → vuelve al mosaico
→ siguiente mes/año
```

### Detección de duplicado = fin de mes

Cuando `SHIFT+D` genera un archivo que ya existe en `~/Downloads/` o en la carpeta del mes,
Python detecta que se ha llegado al final del mes y aborta el bucle.

## Arquitectura de componentes

### 1. Extensión de Chrome (`extension/`)
**Responsabilidad mínima**: solo observa el estado de Google Fotos, no controla el flujo.

Señales que emite (JSON en `~/Downloads/`):
- `gp_signal_has_results.json` — hay al menos un item en la búsqueda actual
- `gp_signal_no_results.json` — la búsqueda no devolvió resultados
- `gp_signal_download_started.json` — se detectó el inicio de una descarga
- `gp_signal_download_done.json` — la descarga completó (archivo ya en disco)

Cómo detecta el estado:
- Presencia/ausencia de items en el DOM de resultados de búsqueda
- Observación del estado de descarga del navegador (si es posible vía `chrome.downloads` API)
- **Nota**: `chrome.downloads` API permite observar descargas sin hacer scraping directo

### 2. Orquestador Python (`orchestrator/`)
**Responsabilidad**: dirige el flujo completo, gestiona el estado y la resiliencia.

- Lee los JSON de señalización de la extensión (polling o `watchdog`)
- Decide qué tecla enviar a AHK a continuación
- Detecta fin de mes (archivo duplicado en `~/Downloads/`)
- Mueve/renombra archivos descargados a `~/Downloads/mes_año/`
- Mantiene un registro de progreso (`estado.json`) para poder **pausar y reanudar**
- Interfaz de consola para pausar en el mes actual y continuar más tarde

### 3. AutoHotkey (`ahk/`)
**Responsabilidad**: enviar teclas al sistema operativo de forma fiable.

- Recibe instrucción de Python (via archivo `gp_cmd.ahk` o pipe) con la tecla a enviar
- Enfoca la ventana de Chrome justo antes del envío (`WinActivate`)
- Usa `Send` o `ControlSend` según convenga
- Introduce delays aleatorios pequeños entre pulsaciones para parecer humano

### Comunicación (JSON en disco)

```
Extensión  →  ~/Downloads/gp_signal_*.json  →  Python (consume y borra el archivo)
Python     →  ~/Downloads/gp_cmd.txt        →  AHK (AHK hace polling del archivo)
```

El archivo de comando se borra tras ser procesado por AHK para evitar procesarlo dos veces.

## Estructura de directorios

```
gp_downloader/
├── extension/              # Extensión Chrome Manifest V3
│   ├── manifest.json
│   ├── background.js       # Service worker + chrome.downloads observer
│   └── content.js          # Observer del DOM de Google Fotos
├── orchestrator/
│   ├── main.py             # Bucle principal + CLI de pausa/reanudación
│   ├── watcher.py          # Lectura de señales JSON
│   ├── file_manager.py     # Mover/renombrar descargas a mes_año/
│   └── state.json          # Progreso persistente (mes actual, items procesados)
├── ahk/
│   └── sender.ahk          # Lee gp_cmd.txt y envía la tecla a Chrome
├── config/
│   └── meses.csv           # Lista ordenada de "mes año" a procesar
└── CLAUDE.md
```

## Configuración externa (`config/meses.csv`)

```csv
mes,anyo,estado
enero,2015,pendiente
febrero,2015,pendiente
...
diciembre,2024,completado
```

`estado` puede ser: `pendiente`, `en_curso`, `completado`, `saltado`

## Gestión de archivos descargados

- Directorio destino: `~/Downloads/gp/mes_año/` (ej. `gp/enero_2015/`)
- Python mueve cada archivo descargado a su carpeta antes de pedir la siguiente tecla
- Si el nombre de archivo ya existe en la carpeta, renombra con sufijo `_2`, `_3`, etc.
- La detección de "mismo archivo dos veces" = mismo nombre base (sin sufijo de Chrome como `(1)`)

## Resiliencia y pausa

- `estado.json` guarda el mes/año actual y el índice del último item descargado
- Python ofrece comando `p` en consola para pausar al terminar el item actual
- Al reanudar, lee `estado.json` y navega directamente al mes/año donde se quedó
- Si Chrome se cierra o falla, Python espera y reintenta antes de abortar

## Decisión de arquitectura: JSON en disco vs. Native Messaging

Para este caso de uso (35.000 items, ritmo humano, sin urgencia de latencia baja)
**la solución con JSON en disco es preferible**:
- Simplicidad de implementación y depuración
- Los archivos JSON son legibles si hay que depurar
- La latencia de polling (100-500ms) es irrelevante cuando cada descarga tarda segundos

Native Messaging queda documentado como alternativa futura si se necesita reactividad inmediata.

## Convenciones de código

- Python 3.11+, dependencias mínimas (`watchdog` para observar archivos si se quiere evitar polling activo)
- Extensión en Manifest V3 (service worker, sin background pages persistentes)
- Archivos JSON de señalización: prefijo `gp_`, se borran tras ser consumidos
- Logs en español en consola; código y nombres de variables en inglés
- Delays entre pulsaciones: aleatorios en rango humano (0.5s – 2s según la acción)
