import threading

from .config import SEARCH_TIMEOUT, DOWNLOAD_TIMEOUT
from . import watcher, state
from .file_manager import move_to_month

_pause = threading.Event()
_quit  = threading.Event()


def _console():
    print('Comandos: [p] pausar al terminar el mes actual  [q] salir')
    while not _quit.is_set():
        try:
            cmd = input().strip().lower()
        except EOFError:
            break
        if cmd == 'p':
            _pause.set()
            print('[!] Pausa solicitada — se detendrá al terminar el mes actual.')
        elif cmd == 'q':
            _quit.set()
            print('[!] Saliendo...')


def _search(mes: str, anyo: str):
    watcher.drain()
    watcher.send_command({'action': 'search', 'query': f'{mes} {anyo}'})


def _download_month(mes: str, anyo: str) -> tuple[int, bool]:
    seen_urls: set[str] = set()
    count = 0

    watcher.send_command({'action': 'open_first'})
    sig = watcher.wait(['photo_opened'], timeout=10, stop_event=_quit)
    if sig is None:
        print('  no se pudo abrir la primera foto')
        return count, False

    while not _quit.is_set():
        watcher.drain()
        watcher.send_command({'action': 'download'})

        print(f'  [{mes} {anyo}] #{count + 1} esperando descarga...', end='', flush=True)
        signal = watcher.wait(['download_done'], timeout=DOWNLOAD_TIMEOUT, stop_event=_quit)

        if signal is None:
            print(' TIMEOUT — abortando mes')
            watcher.send_command({'action': 'back'})
            return count, False

        photo_url = signal.get('photoUrl', '')
        filename  = signal.get('filename', '')
        basename  = signal.get('basename', '')

        if photo_url in seen_urls:
            print(f' {basename} → fin de mes ({count} fotos)')
            try:
                move_to_month(filename, mes, anyo)
            except FileNotFoundError:
                pass
            watcher.send_command({'action': 'back'})
            return count, True

        seen_urls.add(photo_url)

        try:
            dest = move_to_month(filename, mes, anyo)
            count += 1
            print(f' {basename} → {dest.parent.name}/')
        except FileNotFoundError as e:
            print(f' ERROR moviendo archivo: {e}')

        watcher.send_command({'action': 'next'})
        sig = watcher.wait(['photo_opened'], timeout=10, stop_event=_quit)
        if sig is None and not _quit.is_set():
            print(f'  TIMEOUT esperando siguiente foto — abortando mes')
            watcher.send_command({'action': 'back'})
            return count, False

    return count, False


def run():
    watcher.start()
    threading.Thread(target=_console, daemon=True).start()

    months = state.load()
    pendientes = state.pending(months)
    print(f'Meses pendientes: {len(pendientes)}')

    try:
        for m in pendientes:
            if _quit.is_set():
                break

            mes, anyo = m['mes'], m['anyo']
            print(f'\n=== {mes} {anyo} ===')
            state.mark(months, mes, anyo, 'en_curso')

            _search(mes, anyo)

            print(f'  Esperando resultado de búsqueda...', end='', flush=True)
            signal = watcher.wait(['no_results', 'search_ready'], timeout=SEARCH_TIMEOUT, stop_event=_quit)

            if signal is None:
                print(' TIMEOUT sin señal → saltando mes')
                state.mark(months, mes, anyo, 'pendiente')
                continue

            if signal['type'] == 'no_results':
                print(' sin resultados → saltando')
                state.mark(months, mes, anyo, 'saltado')
                continue

            print(' todos los resultados cargados')
            count, ok = _download_month(mes, anyo)

            if _quit.is_set() or not ok:
                state.mark(months, mes, anyo, 'pendiente')
                if not ok:
                    print(f'  [!] {mes} {anyo}: abortado ({count} fotos descargadas)')
            else:
                state.mark(months, mes, anyo, 'completado')
                print(f'  [OK] {mes} {anyo}: {count} fotos')

            if _pause.is_set():
                print('Pausado. Vuelve a ejecutar para continuar.')
                break

    finally:
        pass
