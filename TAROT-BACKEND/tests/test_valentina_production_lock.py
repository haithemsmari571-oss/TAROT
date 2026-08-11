"""Raw-byte verification of the eleven Production Lock Version 5 files."""

from __future__ import annotations

import hashlib
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

LOCKED_SHA256 = {
    # Production Lock Version 5: owner-approved Milestone 11 changed
    # reading_duo.py to consume the existing Atlas session cache. Versions 1-4
    # stay preserved in Second Brain.
    "app/config.py": "B760A1DB9ACE63180B1733215A10F63EC92F8CBCC306ADDAF693FC3CA147ADC1",
    "app/services/ai/client.py": "D623402DAD09D9F760D7E0EF740FC5EFF99DFB949A5DE314095E9C02BE4CB9CD",
    "app/services/ai/reading_pipeline.py": "CE051BD93273D51280E7FDB23DC9BDE5F48EA278AD8869FD89568A08CE93F50C",
    "app/services/ai/reading_duo.py": "8252470C346428833B7687869BF3B46223E988364B09D54608335200F6938297",
    "app/services/ai/reading_valentina.py": "2C5FF2B308604B781CB385D088C755BB6BDB61A4158DD3309649E86A5C2257FA",
    "app/services/ai/reading_sabri.py": "C0BFF1AAC2681059ED4633210ACA2D0ED7A94E60D4FE3ED10F6B2E480FEE2E01",
    "app/services/ai/reading_reveal.py": "1D54D58FC4AE510F652327A502E50AB0F8430E48E2E662928E7C27D8E72FBA53",
    "app/services/ai/reading_reader.py": "3C5F0082FCF7284C949E3586CC1B5180F9D226F98426460BFAF95E81E882C396",
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
