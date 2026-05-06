import json
import queue
import time
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

_queue: queue.Queue = queue.Queue()


class _SignalHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if not (path.name.startswith('gp_signal_') and path.suffix == '.json'):
            return

        time.sleep(0.15)  # esperar a que Chrome termine de escribir el archivo

        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            path.unlink(missing_ok=True)

            if 'no_results' in path.name:
                data['_type'] = 'no_results'
            elif 'download_done' in path.name:
                data['_type'] = 'download_done'
            else:
                return

            _queue.put(data)
        except Exception as e:
            print(f'[watcher] Error procesando {path.name}: {e}')


def start(signals_dir: Path) -> Observer:
    signals_dir.mkdir(parents=True, exist_ok=True)
    observer = Observer()
    observer.schedule(_SignalHandler(), str(signals_dir), recursive=False)
    observer.start()
    return observer


def drain():
    """Descarta señales pendientes de operaciones anteriores."""
    while not _queue.empty():
        try:
            _queue.get_nowait()
        except queue.Empty:
            break


def wait(expected_types: list[str], timeout: float) -> dict | None:
    """Espera una señal del tipo indicado hasta agotar el timeout."""
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return None
        try:
            signal = _queue.get(timeout=min(remaining, 1.0))
            if signal['_type'] in expected_types:
                return signal
            # Tipo inesperado: descartar y seguir esperando en el tiempo restante
        except queue.Empty:
            continue  # sin señal en este segundo, seguir hasta deadline
