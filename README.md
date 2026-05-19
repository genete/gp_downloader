# gp_downloader

Descarga masiva de fotos y vídeos de Google Fotos navegando la línea temporal y clasificando cada archivo automáticamente por fecha.

No usa la API de Google ni hace scraping agresivo. Automatiza exactamente lo que haría un usuario descargando a mano, a ritmo humano.

## Cómo funciona

1. El usuario abre la primera foto en Google Fotos y ejecuta el script
2. El script abre el panel de información (`i`) para leer la fecha de cada foto
3. Descarga con `Shift+D`, lee la fecha del DOM, mueve el archivo a `gp/mes_año/`
4. Avanza con la flecha derecha y repite
5. Al pausar o interrumpir, guarda la URL de la última foto descargada
6. Al reanudar, navega directamente a esa foto sin recorrer las ya descargadas

## Arquitectura

```
Google Fotos (Chrome)
       │
       │  CDP (teclado: Shift+D, →, i)
       ▼
 background.js ──── HTTP localhost:8765 ────▶ Orquestador Python
       │                                             │
       │  PHOTO_OPENED {url, date}                   │  move_to_month()
       │  download_done {filename}                   ▼
       └────────────────────────────────▶  ~/Downloads/gp/mes_año/
```

| Componente | Tecnología | Rol |
|---|---|---|
| `extension/background.js` | JS / Manifest V3 | Envía teclas vía CDP, monitoriza descargas |
| `extension/content.js` | JS | Detecta cambios de URL, lee fecha del DOM |
| `orchestrator/` | Python 3.11+ | Dirige el flujo, organiza archivos, guarda progreso |

## Requisitos

- Windows 10/11
- Google Chrome con la extensión cargada en modo desarrollador
- Python 3.11+ (sin dependencias externas)

## Instalación

```bash
git clone https://github.com/tu-usuario/gp_downloader
cd gp_downloader
```

Cargar la extensión en Chrome:

1. Ir a `chrome://extensions`
2. Activar **Modo desarrollador**
3. **Cargar descomprimida** → seleccionar la carpeta `extension/`

## Uso

**Primera vez:**

1. Abrir Google Fotos en Chrome y navegar hasta la foto más reciente que quieras descargar
2. Hacer clic en ella para abrirla en vista de detalle
3. Ejecutar el script:

```bash
python -m orchestrator.main
```

4. Pulsar `Enter` en la consola

**Reanudar sesión anterior:**

El script detecta automáticamente la última foto descargada en `config/progress.json` y continúa desde ahí sin intervención manual:

```bash
python -m orchestrator.main
```

**Controles durante la ejecución:**

| Tecla | Acción |
|---|---|
| `p` | Pausar al terminar la foto actual |
| `q` | Guardar estado y salir |

> **Importante:** la pestaña de Google Fotos debe permanecer activa y enfocada durante toda la ejecución. Si se enfoca otra pestaña o ventana del navegador, los comandos de teclado se enviarán a esa pestaña y el proceso se detendrá. Usa otro navegador o dispositivo para navegar mientras el script corre.

## Archivos descargados

```
~/Downloads/gp/
├── junio_2024/
├── mayo_2024/
├── ...
└── enero_2015/
```

El progreso se guarda en `config/progress.json`:

```json
{
  "downloaded": 1842,
  "last_url": "https://photos.google.com/photo/AF1Qip..."
}
```

## Licencia

MIT — ver [LICENSE](LICENSE)
