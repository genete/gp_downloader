import random
import sys
import threading
import time

from .config import SIGNALS_DIR, SEARCH_TIMEOUT, DOWNLOAD_TIMEOUT
from . import watcher, ahk, state
from .file_manager import move_to_month

# Flags de control desde la consola
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
    ahk.send('slash')
    ahk.send('ctrl_a')
    ahk.type_text(f'{mes} {anyo}')
    ahk.send('enter', pause_min=0.5, pause_max=1.0)


def _download_month(mes: str, anyo: str) -> tuple[int, bool]:
    """Descarga todas las fotos del mes. Devuelve (count, completado_ok)."""
    seen_urls: set[str] = set()
    count = 0

    # Abrir el primer ítem (solo una vez)
    time.sleep(random.uniform(1.0, 2.0))
    ahk.send('enter')
    time.sleep(random.uniform(0.8, 1.5))

    while not _quit.is_set():
        watcher.drain()
        ahk.send('shift_d')

        print(f'  [{mes} {anyo}] #{count + 1} esperando descarga...', end='', flush=True)
        signal = watcher.wait(['download_done'], timeout=DOWNLOAD_TIMEOUT)

        if signal is None:
            print(' TIMEOUT — abortando mes')
            ahk.send('escape')
            return count, False

        photo_url = signal.get('photoUrl', '')
        filename  = signal.get('filename', '')
        basename  = signal.get('basename', '')

        if photo_url in seen_urls:
            # Misma URL = Google Fotos volvió al primer ítem → fin de mes
            print(f' {basename} → fin de mes ({count} fotos)')
            try:
                move_to_month(filename, mes, anyo)
            except FileNotFoundError:
                pass
            ahk.send('escape')
            time.sleep(random.uniform(0.8, 1.5))
            return count, True

        seen_urls.add(photo_url)

        try:
            dest = move_to_month(filename, mes, anyo)
            count += 1
            print(f' {basename} → {dest.parent.name}/')
        except FileNotFoundError as e:
            print(f' ERROR moviendo archivo: {e}')

        ahk.send('right')

    return count, False


def run():
    watcher.start(SIGNALS_DIR)
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

            # Buscar el mes
            watcher.drain()
            _search(mes, anyo)

            print(f'  Esperando resultado de búsqueda...', end='', flush=True)
            signal = watcher.wait(['no_results'], timeout=SEARCH_TIMEOUT)

            if signal:
                print(' sin resultados → saltando')
                state.mark(months, mes, anyo, 'saltado')
                continue

            print(' hay resultados')
            count, ok = _download_month(mes, anyo)

            if _quit.is_set() or not ok:
                state.mark(months, mes, anyo, 'pendiente')
                if not ok:
                    print(f'  [!] {mes} {anyo}: abortado por timeout ({count} fotos descargadas)')
            else:
                state.mark(months, mes, anyo, 'completado')
                print(f'  [OK] {mes} {anyo}: {count} fotos')

            if _pause.is_set():
                print('Pausado. Vuelve a ejecutar para continuar desde el siguiente mes.')
                break

    finally:
        pass  # el polling no tiene recursos que liberar


if __name__ == '__main__':
    run()
