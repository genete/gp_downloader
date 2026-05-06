import shutil
from pathlib import Path

from .config import DEST_DIR


def move_to_month(src_path: str, mes: str, anyo: str) -> Path:
    src = Path(src_path)
    if not src.exists():
        raise FileNotFoundError(f'Archivo no encontrado: {src}')

    dest_dir = DEST_DIR / f'{mes}_{anyo}'
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest = dest_dir / src.name
    if dest.exists():
        # Dos fotos distintas con el mismo nombre en el mismo mes
        stem, suffix = src.stem, src.suffix
        i = 2
        while dest.exists():
            dest = dest_dir / f'{stem}_{i}{suffix}'
            i += 1

    shutil.move(str(src), str(dest))
    return dest
