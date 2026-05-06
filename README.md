# gp_downloader

Descargador autónomo de fotos y vídeos de Google Fotos.

## ¿Qué hace?

Automatiza la descarga masiva de contenido desde Google Fotos combinando tres piezas:

- **Extensión de Chrome**: lee el DOM de Google Fotos y detecta los elementos multimedia disponibles.
- **Orquestador Python**: dirige el flujo de descarga, gestiona el progreso y coordina los demás componentes.
- **AutoHotkey (AHK)**: envía combinaciones de teclas al navegador para acciones que requieren interacción nativa del sistema operativo.

La comunicación entre la extensión y Python se realiza mediante archivos JSON escritos en `~/Downloads/`. También se estudia el uso de **Chrome Native Messaging** como alternativa más directa.

## Estado actual

Proyecto en fase de diseño / prototipo inicial.

## Arquitectura

```
┌─────────────────────┐
│  Google Fotos (Chrome) │
│  + Extensión         │
└────────┬────────────┘
         │ JSON en ~/Downloads/
         ▼
┌─────────────────────┐       ┌──────────┐
│  Orquestador Python  │──────▶│   AHK    │
└─────────────────────┘       └──────────┘
```

## Requisitos

- Windows 10/11
- Chrome con la extensión cargada en modo desarrollador
- Python 3.11+
- AutoHotkey v2

## Instalación

> Instrucciones pendientes hasta que el prototipo esté funcional.

## Alternativa: Native Messaging

Se está evaluando reemplazar los JSON en disco por **Chrome Native Messaging**, donde la extensión se comunica directamente con un proceso Python mediante stdin/stdout. Esto eliminaría la necesidad de polling y archivos temporales, a costa de mayor complejidad de configuración.

## Licencia

MIT
