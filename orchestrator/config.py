from pathlib import Path

ROOT       = Path(__file__).parent.parent
DEST_DIR   = Path.home() / 'Downloads' / 'gp'
MONTHS_CSV = ROOT / 'config' / 'meses.csv'

SEARCH_TIMEOUT   = 120  # segundos esperando search_ready o no_results
DOWNLOAD_TIMEOUT = 120  # segundos máximos esperando una descarga
