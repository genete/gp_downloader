from pathlib import Path

ROOT             = Path(__file__).parent.parent
DEST_DIR         = Path.home() / 'Downloads' / 'gp'
PROGRESS_FILE    = ROOT / 'config' / 'progress.json'
DOWNLOAD_TIMEOUT = 120  # segundos máximos esperando una descarga
