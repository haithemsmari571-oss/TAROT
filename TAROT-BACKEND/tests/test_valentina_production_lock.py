"""Raw-byte verification of the eleven Production Lock Version 9 files."""

from __future__ import annotations

import hashlib
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

LOCKED_SHA256 = {
    # Production Lock Version 9: owner-editable live prompts and deterministic
    # Sabri humanization. Versions 1-8 stay preserved in Second Brain.
    "app/config.py": "B760A1DB9ACE63180B1733215A10F63EC92F8CBCC306ADDAF693FC3CA147ADC1",
    "app/services/ai/client.py": "D623402DAD09D9F760D7E0EF740FC5EFF99DFB949A5DE314095E9C02BE4CB9CD",
    "app/services/ai/reading_pipeline.py": "CE051BD93273D51280E7FDB23DC9BDE5F48EA278AD8869FD89568A08CE93F50C",
    "app/services/ai/reading_duo.py": "3C44CD652624749F55279A3F97C9E6D351FA25DAECC03FE858867A2203DA3FDE",
    "app/services/ai/reading_valentina.py": "B3C75F78CF471E8B15F46D9FE39544F52167E664D8BA58B911F27364714571CB",
    "app/services/ai/reading_sabri.py": "7D0966F1EB47FCC3C3D832241E68CDD82B2A9B166EF8F7D2F659430CFB8CADE8",
    "app/services/ai/reading_reveal.py": "0B1A10DD5A34FD96AA9641CDCA2F5F36E75330A0928B829584582ABE1C629B49",
    "app/services/ai/reading_reader.py": "8AD6FC695C7CAA27E0EE77342DC8066843DD235B79322B5CE42B075C7CF4C95E",
    "app/services/ai/reading_assistant.py": "7A184E9E2F3D503C3B3D7943E2D0549D83E76EB2A0CD28660D6D488427CE6408",
    "app/services/ai/sabri_check.py": "7DEB9C5B38176A87BB57563BF70A9A58522FE1051E1163B72B8D75A106F10960",
    "app/services/client_dossier.py": "6A7F62BEDEAAEF7F5C70A382DAA6C31D918EA41B34207F20FCD1E1BA19DBFDE8",
}


def test_all_eleven_production_lock_hashes_match():
    assert len(LOCKED_SHA256) == 11
    for relative_path, expected in LOCKED_SHA256.items():
        path = BACKEND_ROOT / relative_path
        assert path.is_file(), f"locked file missing: {relative_path}"
        with path.open("rb") as source:
            actual = hashlib.file_digest(source, "sha256").hexdigest().upper()
        assert actual == expected, f"locked file drifted: {relative_path}"
