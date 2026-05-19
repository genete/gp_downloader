import json
import threading
from pathlib import Path

from .config import DOWNLOAD_TIMEOUT, PROGRESS_FILE
from . import watcher
from .file_manager import move_to_month

_pause = threading.Event()
_quit  = threading.Event()

MESES = {
    1: 'enero', 2: 'febrero', 3: 'marzo', 4: 'abril',
    5: 'mayo', 6: 'junio', 7: 'julio', 8: 'agosto',
    9: 'septiembre', 10: 'octubre', 11: 'noviembre', 12: 'diciembre'
}


def _load_progress() -> dict:
    try:
        return json.loads(PROGRESS_FILE.read_text(encoding='utf-8'))
    except Exception:
        return {'downloaded': 0, 'last_url': ''}


def _save_progress(data: dict):
    PROGRESS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')


def _console():
    print('Comandos: [p] pausar  [q] salir')
    while not _quit.is_set():
        try:
            cmd = input().strip().lower()
        except EOFError:
            break
        if cmd == 'p':
            _pause.set()
            print('[!] Pausa solicitada — se detendrá tras la foto actual.')
        elif cmd == 'q':
            _quit.set()
            print('[!] Saliendo...')


def run():
    watcher.start()
    threading.Thread(target=_console, daemon=True).start()

    progress  = _load_progress()
    count     = progress.get('downloaded', 0)
    last_url  = progress.get('last_url', '')

    print(f'Fotos descargadas en sesiones anteriores: {count}')

    watcher.drain()

    if last_url:
        # Reanudar: navegar directamente a la última foto descargada
        print(f'Reanudando desde última URL guardada...')
        watcher.send_command({'action': 'navigate', 'url': last_url})
        sig = watcher.wait(['photo_opened'], timeout=20, stop_event=_quit)
        if sig is None:
            print('No se pudo navegar a la última URL — iniciando desde la cuadrícula')
            last_url = ''

        if last_url:
            # Avanzar una foto más allá de la última descargada
            print('Avanzando a la siguiente foto no descargada...')
            watcher.send_command({'action': 'next'})
            sig = watcher.wait(['photo_opened'], timeout=12, stop_event=_quit)
            if sig is None:
                print('Sin más fotos tras la última descargada. ¡Todo completado!')
                return

    if not last_url:
        print('Pon Google Fotos en la cuadrícula donde quieres empezar y pulsa Enter...')
        try:
            input()
        except EOFError:
            pass
        watcher.send_command({'action': 'open_first'})
        sig = watcher.wait(['photo_opened'], timeout=20, stop_event=_quit)
        if sig is None:
            print('No se pudo abrir la primera foto — ¿está Google Fotos en la cuadrícula?')
            return

    session_count = 0

    while not _quit.is_set():
        photo_url = sig.get('photoUrl', '')
        date      = sig.get('date')   # {year, month, day} o None

        # Etiqueta para el log
        if date:
            etiqueta = f'{date["day"]:02d}/{date["month"]:02d}/{date["year"]}'
        else:
            etiqueta = 'sin fecha'

        print(f'  #{count + 1} [{etiqueta}] descargando...', end='', flush=True)

        watcher.drain()
        watcher.send_command({'action': 'download'})
        dl = watcher.wait(['download_done'], timeout=DOWNLOAD_TIMEOUT, stop_event=_quit)

        if dl is None:
            print(' TIMEOUT — abortando')
            break

        filename = dl.get('filename', '')
        basename = dl.get('basename', '')

        if date:
            mes  = MESES[date['month']]
            anyo = str(date['year'])
            try:
                dest = move_to_month(filename, mes, anyo)
                count += 1
                session_count += 1
                print(f' {basename} → {dest.parent.name}/')
            except FileNotFoundError as e:
                print(f' ERROR moviendo: {e}')
        else:
            print(f' {basename} (sin fecha — archivo no movido)')

        progress['downloaded'] = count
        progress['last_url']   = photo_url
        _save_progress(progress)

        if _pause.is_set():
            print(f'Pausado. Descargadas esta sesión: {session_count}. Total: {count}')
            break

        # Siguiente foto
        watcher.send_command({'action': 'next'})
        sig = watcher.wait(['photo_opened'], timeout=12, stop_event=_quit)

        if sig is None and not _quit.is_set():
            print(f'\nSin más fotos. Sesión: {session_count}. Total: {count}')
            break

    _save_progress(progress)
    print(f'Total acumulado: {count} fotos')


if __name__ == '__main__':
    run()
