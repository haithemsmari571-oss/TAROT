"""Raw-byte verification of the eleven Phase 0 Production Lock files."""

from __future__ import annotations

import hashlib
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

LOCKED_SHA256 = {
    "app/config.py": "F0C26D8A27297A7F7A20D7FA57350F0AD75FA3D22260949B1BF7D75B7E64A274",
    "app/services/ai/client.py": "D623402DAD09D9F760D7E0EF740FC5EFF99DFB949A5DE314095E9C02BE4CB9CD",
    "app/services/ai/reading_pipeline.py": "CE051BD93273D51280E7FDB23DC9BDE5F48EA278AD8869FD89568A08CE93F50C",
    "app/services/ai/reading_duo.py": "5764D1EAA360E059155C17DC2C0D75823E3094DACE9A9B956DAF1DC4C5CB41FA",
    "app/services/ai/reading_valentina.py": "CFA6E020E190B6692028725C8C25F8B8A112E13B051763EA5E0EF8047F829AC1",
    "app/services/ai/reading_sabri.py": "E9AA336DD5B05382444A6DA9659755AACD17C868F630DB3D5A402E0F01EE6885",
    "app/services/ai/reading_reveal.py": "7C28D812A530A1AB21821F3ABFB0F28756936B7AB28E6DF5331B5D7DD68D1C6A",
    "app/services/ai/reading_reader.py": "9BC1EBE62D08F164D19E34A954F4DDC26616C46B4BD0D12ABBAD8EBCC1D064C9",
    "app/services/ai/reading_assistant.py": "870A53FF7831C458C944C1A4CEA7FF9FB60A1555A22DCA60B9FBA6DAB76F7910",
    "app/services/ai/sabri_check.py": "7DEB9C5B38176A87BB57563BF70A9A58522FE1051E1163B72B8D75A106F10960",
    "app/services/client_dossier.py": "6EF712EB93AB666F63C69BE7DBA44833A03ADBE3A4BB02070351F3525AF905DB",
}


def test_all_eleven_production_lock_hashes_match():
    assert len(LOCKED_SHA256) == 11
    for relative_path, expected in LOCKED_SHA256.items():
        path = BACKEND_ROOT / relative_path
        assert path.is_file(), f"locked file missing: {relative_path}"
        with path.open("rb") as source:
            actual = hashlib.file_digest(source, "sha256").hexdigest().upper()
        assert actual == expected, f"locked file drifted: {relative_path}"
