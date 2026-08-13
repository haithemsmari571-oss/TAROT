"""Verification of the eleven Production Lock Version 10 files."""

from __future__ import annotations

import hashlib
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

LOCKED_SHA256 = {
    # Production Lock Version 10: versioned live prompt-model selection.
    # Versions 1-9 stay preserved in Second Brain.
    "app/config.py": "B760A1DB9ACE63180B1733215A10F63EC92F8CBCC306ADDAF693FC3CA147ADC1",
    "app/services/ai/client.py": "35E42B59265880441751DE0F53A7637A032B51D60A1D9B64A12AAD20865658CB",
    "app/services/ai/reading_pipeline.py": "DA5652389C0330BF53F522389487AD6F259C4C19052C1116F76188B0FCBCD985",
    "app/services/ai/reading_duo.py": "845484D1CF1DAFFB68992089A6BE16C9E280FDE5E508545994A15E2DB2D43BED",
    "app/services/ai/reading_valentina.py": "0CEC02B404AC5842BAEBA68FA97DEA4A0EBDE60FB63994CBAE700FD397B1D2F1",
    "app/services/ai/reading_sabri.py": "73D6BDF684EAA540B1B32BC71AC53B81E03D092B27BF62C50F4D5113B4A1FF24",
    "app/services/ai/reading_reveal.py": "F90FBD4FB3A24A3D043E138AEFE17FB54EBCB760C413D4A462D52F39337DC885",
    "app/services/ai/reading_reader.py": "C06D47F6E15D0846BB47F35FB077B9EAB44BAE83ABE703C9C0BCE91192D60A53",
    "app/services/ai/reading_assistant.py": "7A184E9E2F3D503C3B3D7943E2D0549D83E76EB2A0CD28660D6D488427CE6408",
    "app/services/ai/sabri_check.py": "7DEB9C5B38176A87BB57563BF70A9A58522FE1051E1163B72B8D75A106F10960",
    "app/services/client_dossier.py": "C1C6DA1DC5B4B57A0538488BE4ED3786D1D55854AED48D7DCFF5CD7A07201963",
}


def _normalized_source_sha256(path: Path) -> str:
    source = path.read_bytes()
    normalized = source.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(normalized).hexdigest().upper()


def test_all_eleven_production_lock_hashes_match():
    assert len(LOCKED_SHA256) == 11
    for relative_path, expected in LOCKED_SHA256.items():
        path = BACKEND_ROOT / relative_path
        assert path.is_file(), f"locked file missing: {relative_path}"
        actual = _normalized_source_sha256(path)
        assert actual == expected, f"locked file drifted: {relative_path}"


def test_production_lock_normalizes_checkout_line_endings(tmp_path):
    lf = tmp_path / "lf.py"
    crlf = tmp_path / "crlf.py"
    cr = tmp_path / "cr.py"
    lf.write_bytes(b"first\nsecond\n")
    crlf.write_bytes(b"first\r\nsecond\r\n")
    cr.write_bytes(b"first\rsecond\r")

    expected = _normalized_source_sha256(lf)
    assert _normalized_source_sha256(crlf) == expected
    assert _normalized_source_sha256(cr) == expected
