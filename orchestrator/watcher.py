import json
import time
from pathlib import Path

_signals_dir: Path | None = None


def start(signals_dir: Path):
    global _signals_dir
    signals_dir.mkdir(parents=True, exist_ok=True)
    _signals_dir = signals_dir


def drain():
    """Descarta todas las señales pendientes."""
    if _signals_dir is None:
        return
    for f in _signals_dir.glob('gp_signal_*.json'):
        try:
            f.unlink(missing_ok=True)
        except OSError:
            pass


def wait(expected_types: list[str], timeout: float) -> dict | None:
    """Polling cada 0.5s hasta encontrar una señal del tipo esperado o agotar timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for signal_type in expected_types:
            files = sorted(_signals_dir.glob(f'gp_signal_{signal_type}_*.json'))
            if not files:
                continue
            f = files[0]
            try:
                data = json.loads(f.read_text(encoding='utf-8'))
                f.unlink(missing_ok=True)
                data['_type'] = signal_type
                return data
            except Exception as e:
                print(f'[watcher] Error leyendo {f.name}: {e}')
        time.sleep(0.5)
    return None
