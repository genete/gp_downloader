# gp_downloader

Descargador autónomo de fotos y vídeos de Google Fotos que simula comportamiento humano para no incumplir los Términos de Servicio.

## ¿Cómo funciona?

En lugar de llamar a ninguna API ni hacer scraping agresivo, el sistema automatiza exactamente lo que haría un usuario descargando fotos a mano:

1. Busca un mes y año concreto en Google Fotos (`/ → CTRL+A → "enero 2018" → ENTER`)
2. Si hay resultados, descarga item a item con `SHIFT+D` avanzando con `→`
3. Detecta el fin del mes cuando el mismo archivo aparece por segunda vez
4. Cambia al siguiente mes y repite
5. Organiza los archivos descargados en carpetas `mes_año/`

El ritmo es lento e intencional: una descarga cada vez, con pausas naturales entre pulsaciones.

## Componentes

| Componente | Tecnología | Rol |
|---|---|---|
| Extensión Chrome | JS / Manifest V3 | Observa el DOM y el estado de descargas |
| Orquestador | Python 3.11+ | Dirige el flujo y gestiona archivos |
| Automatización de teclado | AutoHotkey v2 | Envía teclas al navegador de forma fiable |

## Comunicación entre componentes

```
Extensión Chrome
      │
      │  archivos gp_signal_*.json en ~/Downloads/
      ▼
Orquestador Python ──── gp_cmd.txt ────▶ AutoHotkey ──▶ Chrome (teclas)
      │
      ▼
  ~/Downloads/gp/mes_año/
```

## Requisitos

- Windows 10/11
- Google Chrome con la extensión cargada en modo desarrollador
- Python 3.11+
- AutoHotkey v2

## Configuración

Edita `config/meses.csv` con la lista de meses a descargar:

```csv
mes,anyo,estado
enero,2015,pendiente
febrero,2015,pendiente
```

## Uso

```bash
# Instalar dependencias
pip install -r requirements.txt

# Iniciar la descarga
python orchestrator/main.py

# Durante la ejecución:
#   p  → pausar al terminar el item actual
#   q  → guardar estado y salir
```

El progreso se guarda en `orchestrator/state.json`: si se interrumpe, al volver a ejecutar continúa desde donde lo dejó.

## Estructura del proyecto

```
gp_downloader/
├── extension/          # Extensión Chrome (Manifest V3)
├── orchestrator/       # Orquestador Python
├── ahk/                # Script AutoHotkey
└── config/
    └── meses.csv       # Lista de meses a procesar
```

## Estado del proyecto

En desarrollo. Actualmente en fase de diseño de arquitectura.

## Licencia

MIT
