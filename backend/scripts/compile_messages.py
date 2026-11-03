"""
Compila los archivos .po de locale/ a .mo sin necesitar GNU gettext instalado.

Uso (desde backend/): python scripts/compile_messages.py
Alcanza para entradas simples msgid/msgstr (sin plurales ni contextos).
"""

import ast
import struct
from pathlib import Path

LOCALE_DIR = Path(__file__).resolve().parent.parent / "locale"


def parse_po(path):
    entries = {}
    msgid = msgstr = None
    current = None

    def flush():
        if msgid is not None and msgstr is not None:
            entries[msgid] = msgstr

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("msgid "):
            flush()
            msgid, msgstr, current = ast.literal_eval(line[6:]), None, "id"
        elif line.startswith("msgstr "):
            msgstr, current = ast.literal_eval(line[7:]), "str"
        elif line.startswith('"'):
            if current == "id":
                msgid += ast.literal_eval(line)
            else:
                msgstr += ast.literal_eval(line)
    flush()
    return entries


def write_mo(entries, path):
    keys = sorted(entries)
    ids = b""
    strs = b""
    offsets = []
    for key in keys:
        k, v = key.encode("utf-8"), entries[key].encode("utf-8")
        offsets.append((len(ids), len(k), len(strs), len(v)))
        ids += k + b"\0"
        strs += v + b"\0"

    count = len(keys)
    key_table = 7 * 4
    value_table = key_table + count * 8
    ids_start = value_table + count * 8
    strs_start = ids_start + len(ids)

    output = struct.pack("Iiiiiii", 0x950412DE, 0, count, key_table, value_table, 0, 0)
    for id_off, id_len, _, _ in offsets:
        output += struct.pack("ii", id_len, ids_start + id_off)
    for _, _, str_off, str_len in offsets:
        output += struct.pack("ii", str_len, strs_start + str_off)
    path.write_bytes(output + ids + strs)


def main():
    for po in LOCALE_DIR.glob("*/LC_MESSAGES/*.po"):
        mo = po.with_suffix(".mo")
        entries = parse_po(po)
        write_mo(entries, mo)
        print(f"{mo.relative_to(LOCALE_DIR.parent)}: {len(entries) - 1} mensajes")


if __name__ == "__main__":
    main()
