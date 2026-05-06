import sys

# Forzar UTF-8 en la consola de Windows para evitar UnicodeEncodeError
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from .main import run

run()
