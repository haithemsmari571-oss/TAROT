"""Verification of the eleven Production Lock Version 15 files."""

from __future__ import annotations

import hashlib
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

LOCKED_SHA256 = {
    # Production Lock Version 15: the client's gender is stated, not guessed.
    #
    # The product never collected it, so the reading assumed one, live. It is collected at
    # registration now and injected as verified system data into the same authoritative block
    # that already carries her zodiac, Life Path and Personal Year — and into BOTH roles,
    # since Sabri writes his own connective tissue around her words. NEITHER PROMPT WAS
    # TOUCHED: both constants were verified byte-identical before this was re-cut, and the
    # word "gender" appears in neither.
    #
    #   reading_valentina.py   takes gender and emits the verified block unconditionally
    #   reading_sabri.py       receives the same block, which he never had at all before
    #   reading_duo.py         builds it once and hands it to both roles
    #   client_dossier.py      reports the stated gender for the cockpit client record
    #
    # Production Lock Version 14: the second message of a turn is answered, not the first.
    #
    # Two files moved from Version 13, both from one live defect (chat 20, 15:58 UTC): a
    # client's new question arrived while her previous message was still unanswered, took no
    # presence line and armed no typing indicator, and was then answered as though it were
    # the older message. reading_sabri.py takes the newest message as its own labelled block
    # and refuses a token opening after a long wait; reading_duo.py splits newest from
    # earlier and re-reads the wait clock after Valentina finishes.
    #
    # Production Lock Version 13: Sabri is given the whole reading and his own judgment back.
    #
    # FIVE of the eleven files moved; the other six are byte-identical. NEITHER PROMPT
    # CONSTANT CHANGED — VALENTINA_SYSTEM_PROMPT and SABRI_SYSTEM_PROMPT are byte-for-byte
    # what Version 12 shipped, and were verified as such before this was re-cut. Prompt
    # wording is the owner's and is handled separately; everything below is code.
    #
    #   reading_sabri.py       he receives every unsent word Valentina has written instead
    #                          of the first three sentences, and chooses. The sentence
    #                          slicer, the 26-word message chunker and the [[KEEP_]]
    #                          shielding are gone, and the fact check now runs the other way
    #                          round: it rejects a fact he INVENTED rather than one he chose
    #                          to hold, because holding is now the whole point.
    #   reading_duo.py         the reserve accumulates instead of being replaced, so a
    #                          second reading no longer deletes what the first never said.
    #                          Valentina is given the session capsule and her own unsent
    #                          writing, plus two guards against recapping it or drifting
    #                          into the texting voice she is now reading.
    #   reading_valentina.py   her input takes the capsule in place of the twenty-entry
    #                          transcript window, and her still-unsent writing.
    #   reading_reveal.py      a failed Atlas fetch is retried on the next turn instead
    #                          of being cached exactly like a success, which cost a client
    #                          three hours of long-term memory for one early timeout.
    #   config.py              SABRI_TURN_TARGET_MESSAGES and SABRI_MAX_MESSAGE_WORDS
    #                          deleted (turn size and message length are his judgment now);
    #                          typing speed to 60wpm; the read pause and silence ceiling.
    #
    # Version 12: Version 11 plus the routing decision reason.
    #
    # Version 11 shipped, and its own log could not say WHY a turn routed the way
    # it did — a reaction, a missing hold and a router verdict all printed the
    # same line, and each needs a different fix. reading_duo.py carries that
    # reason now. Version 11's contents are otherwise unchanged and described here:
    #
    # Version 11: the follow-up wait, and the capitalisation defect.
    #
    # Exactly two of the eleven files moved from Version 10; the other nine are
    # byte-identical, which is the point of re-cutting rather than widening.
    #
    #   reading_duo.py    the route is now decided against Sabri's held reserve
    #                     instead of against the wording of her message. A question
    #                     mark alone used to force a fresh 40-60s Valentina call and
    #                     discard 1,500-4,600 characters of reading already written,
    #                     so "say more" cost exactly as much as a new question.
    #   reading_sabri.py  the automatic proper-name guard treated any capitalised
    #                     word in Valentina's prose as a name, including the ones
    #                     that only had a capital because they began a sentence, and
    #                     then force-applied them case-insensitively to the delivery.
    #                     That is how "sitting with you For weeks" reached clients.
    #
    # Versions 1-11 stay preserved in Second Brain.
    "app/config.py": "D0A674E777C0FD77F1751C17C414EEB47F01AF2D0A9CD17167795FCC25DFDA82",
    "app/services/ai/client.py": "35E42B59265880441751DE0F53A7637A032B51D60A1D9B64A12AAD20865658CB",
    "app/services/ai/reading_pipeline.py": "DA5652389C0330BF53F522389487AD6F259C4C19052C1116F76188B0FCBCD985",
    "app/services/ai/reading_duo.py": "33CCA0B8405E0E9872E71C7218C0A31202135554682F329E3E0AD06B6ED6AE2A",
    "app/services/ai/reading_valentina.py": "D3FA28E9688157F2E81FD34D4979FBDCBC11D08AFF3D0061B1B3A2F4C15C198C",
    "app/services/ai/reading_sabri.py": "59A6070134E70D4A4C736A40563928D1C380271A09A7B15B970E3DEF69C9DA4A",
    "app/services/ai/reading_reveal.py": "422150164423E8DA74058D5A390DD992C06DA8E5792F1310194EFE120F7B8AE2",
    "app/services/ai/reading_reader.py": "C06D47F6E15D0846BB47F35FB077B9EAB44BAE83ABE703C9C0BCE91192D60A53",
    "app/services/ai/reading_assistant.py": "7A184E9E2F3D503C3B3D7943E2D0549D83E76EB2A0CD28660D6D488427CE6408",
    "app/services/ai/sabri_check.py": "7DEB9C5B38176A87BB57563BF70A9A58522FE1051E1163B72B8D75A106F10960",
    "app/services/client_dossier.py": "43D625F28E2F8E98AB970B2996FC69407A6F372C61C7B92FA18390A4E18F92B3",
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
