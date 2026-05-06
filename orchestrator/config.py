from pathlib import Path

ROOT        = Path(__file__).parent.parent
SIGNALS_DIR = Path.home() / 'Downloads' / 'gp_signals'
DEST_DIR    = Path.home() / 'Downloads' / 'gp'
AHK_EXE     = Path(r'C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe')
AHK_SCRIPT  = ROOT / 'ahk' / 'sender.ahk'
MONTHS_CSV  = ROOT / 'config' / 'meses.csv'

SEARCH_TIMEOUT   = 6    # segundos esperando señal de "sin resultados"
DOWNLOAD_TIMEOUT = 120  # segundos máximos esperando que complete una descarga
