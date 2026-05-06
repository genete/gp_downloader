import csv
from pathlib import Path

from .config import MONTHS_CSV


def load() -> list[dict]:
    with open(MONTHS_CSV, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def save(months: list[dict]):
    with open(MONTHS_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['mes', 'anyo', 'estado'])
        writer.writeheader()
        writer.writerows(months)


def mark(months: list[dict], mes: str, anyo: str, estado: str):
    for m in months:
        if m['mes'] == mes and m['anyo'] == anyo:
            m['estado'] = estado
            break
    save(months)


def pending(months: list[dict]) -> list[dict]:
    return [m for m in months if m['estado'] == 'pendiente']
