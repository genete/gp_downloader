import random
import subprocess
import time

from .config import AHK_EXE, AHK_SCRIPT


def _run(*args: str):
    result = subprocess.run(
        [str(AHK_EXE), str(AHK_SCRIPT), *args],
        capture_output=True
    )
    if result.returncode != 0:
        raise RuntimeError(f'AHK falló (código {result.returncode}) para {args}')


def send(key: str, pause_min=0.4, pause_max=0.9):
    _run(key)
    time.sleep(random.uniform(pause_min, pause_max))


def type_text(text: str):
    _run('type', text)
    time.sleep(random.uniform(0.3, 0.6))
