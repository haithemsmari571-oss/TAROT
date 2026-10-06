"""scripts/import_reels.py (ROUND67, ROUND68): the Instagram videos as reels.

The captions and spoken words here are made up in the export's style; the real
posts.json is never part of the repository.
"""

import importlib
import json
import re
import struct

from app.schemas.library_item import LIBRARY_ITEM_KEY_PATTERN, MAX_LIBRARY_ITEM_TITLE_LENGTH

import_reels = importlib.import_module("scripts.import_reels")


def test_the_title_limit_and_the_key_are_the_servers():
    assert import_reels.MAX_TITLE_LENGTH == MAX_LIBRARY_ITEM_TITLE_LENGTH
    assert re.fullmatch(LIBRARY_ITEM_KEY_PATTERN, f"{import_reels.KEY_PREFIX}18159328681457438")


def test_the_comment_call_to_action_and_its_answer_go_and_every_other_word_stays():
    caption = (
        "Leo doesn't try to shine. The room just has no choice. Comment Valentina if you are a Leo. "
        "I will read for you. The first one is free. Follow and like the video first."
    )
    title, opening = import_reels.reel_title(caption, "Leo doesn't try to shine.")
    assert title == "Leo doesn't try to shine."
    assert import_reels.reel_description(caption, opening) == "The room just has no choice."


def test_a_sentence_after_the_call_to_action_that_is_not_its_answer_stays():
    text = "The cards already see. Comment Ask Valentina for a free reading. This is the final part of the series."
    assert import_reels.remove_calls_to_action(text) == "The cards already see. This is the final part of the series."
    # An answer on the next line still belongs to the call above it.
    assert import_reels.remove_calls_to_action('Some words. Comment "VALENTINA" .\nI will tell you what is happening.') == "Some words."
    # A free reading mentioned on its own, away from any call, is kept.
    kept = "Your first reading is free. Not because it is worth less."
    assert import_reels.remove_calls_to_action(kept) == kept


def test_follow_dm_save_share_and_handles_go_with_their_whole_line():
    text = (
        "Cheating hides in small shifts. 🖤\n\n💭 Which sign hit you the hardest?\n"
        "🔁 Save this for later & share with someone who needs it.\n"
        "⚡ Follow @someone_else for more truths.\n\n•\n\n•"
    )
    assert import_reels.remove_calls_to_action(text) == "Cheating hides in small shifts. 🖤\n\n💭 Which sign hit you the hardest?"
    offer = "He pulled away. ✨ From now until Sept 15th I’m offering FREE love readings 💌 DM me ❤️ Follow @x for more 🔥"
    assert import_reels.remove_calls_to_action(offer) == "He pulled away."
    # A sentence about commenting is not a request to comment.
    assert import_reels.remove_calls_to_action("When you comment you are not just asking.") == "When you comment you are not just asking."


def test_the_spoken_request_leaves_the_transcript_and_every_other_word_stays():
    transcript = import_reels.reel_transcript
    # The request, its condition before it and the promise after it go; the
    # words after them stay.
    assert transcript(
        "The bridge is already built. If you are a Leo or if a Leo left a mark on you. "
        "Comment ask Valentina and I will read for you. Part four is the water signs."
    ) == "The bridge is already built. Part four is the water signs."
    # As the speech-to-text heard "comment", and every promise that follows.
    assert transcript(
        "Pay the toll. Common Valentina if you are ready I will read for you. "
        "The first one is free. Follow and like the video first."
    ) == "Pay the toll."
    assert transcript(
        "Doors appear. If you are a Scorpio, come in only one number. "
        "The one that found you today, claim it. I will also give you a reading."
    ) == "Doors appear."
    assert transcript("Stop asking. My name is Sam, Carmen Valentina, and your first reading is free. I will text you.") == (
        "Stop asking. My name is Sam."
    )
    assert transcript(
        "Try this tonight. Comment release when you do. Then tell me what happened. "
        "And where it leads you next. Let's see who survives."
    ) == "Try this tonight."
    # A request run into the sentence before it: those words stay.
    assert transcript(
        "Reason three, you kept walking from now until September 15th, I'm offering free love readings. "
        "DM me what's heavy on your heart and I'll take care of you."
    ) == "Reason three, you kept walking."
    assert transcript("Look, the first half revealed you, comment I received this, then tell me, I will read on it for you.") == (
        "Look, the first half revealed you."
    )
    assert transcript("It is a tactic until the new moon, I'm opening space for readings") == "It is a tactic"
    # Unless they are the request's own condition.
    assert transcript("If you are a Scorpio, or if a Scorpio loved you, comment Valentina, I will reach out to you myself.") is None
    assert transcript(
        "Until you see it, you repeat it and if you're done repeating the same story. "
        "I'm opening space until September 21st for free readings. Follow comment then DM me your sign."
    ) == "Until you see it, you repeat it."
    # An invitation with its own sentence stays, and so does "follow" that asks nothing.
    kept = (
        "If you are carrying something, come find me. But heartbreak doesn't follow logic. "
        "You still follow each other online."
    )
    assert transcript(kept + " Comment Ask Valentina and I will read for you.") == kept
    assert transcript("") is None
    assert transcript(None) is None


def test_titles_cut_by_the_export_are_mended():
    # Cut at 90 characters inside a word: the whole first sentence fits 100.
    caption = "Every Scorpio was made by The Tower, taught by The Hanged Man, and is still learning Strength. Which card?"
    title, opening = import_reels.reel_title(caption, caption[:90])
    assert title == "Every Scorpio was made by The Tower, taught by The Hanged Man, and is still learning Strength."
    assert import_reels.reel_description(caption, opening) == "Which card?"

    # Cut at "vs.": the whole first line.
    caption = "Fast Lovers vs. Slow Lovers by Zodiac Sign part 2💖✨\nFollow @x for more"
    title, opening = import_reels.reel_title(caption, "Fast Lovers vs.")
    assert title == "Fast Lovers vs. Slow Lovers by Zodiac Sign part 2💖✨"
    assert import_reels.reel_description(caption, opening) is None

    # Across lines: the first line only, the rest stays in the caption.
    caption = "Emotional strengths\n part 2 ✨\nFollow @x for more astrology"
    title, opening = import_reels.reel_title(caption, caption[:40])
    assert title == "Emotional strengths"
    assert import_reels.reel_description(caption, opening) == "part 2 ✨"

    # Too long for the column: cut at a word, and the caption keeps every word.
    sentence = "Nobody loves harder in silence than an earth sign and nobody waits longer for someone to finally see it."
    caption = sentence + " Second sentence."
    title, opening = import_reels.reel_title(caption, caption[:90])
    assert len(sentence) > import_reels.MAX_TITLE_LENGTH
    assert len(title) <= import_reels.MAX_TITLE_LENGTH
    assert title == "Nobody loves harder in silence than an earth sign and nobody waits longer for someone to finally…"
    assert opening == ""
    assert import_reels.reel_description(caption, opening) == caption


def _mp4(timescale: int, duration: int, *, version: int = 0) -> bytes:
    if version == 1:
        body = bytes([1, 0, 0, 0]) + bytes(16) + struct.pack(">IQ", timescale, duration) + bytes(80)
    else:
        body = bytes(4) + bytes(8) + struct.pack(">II", timescale, duration) + bytes(80)
    mvhd = struct.pack(">I4s", 8 + len(body), b"mvhd") + body
    moov = struct.pack(">I4s", 8 + len(mvhd), b"moov") + mvhd
    ftyp = struct.pack(">I4s", 16, b"ftyp") + b"isom" + bytes(4)
    mdat = struct.pack(">I4s", 8 + 32, b"mdat") + bytes(32)
    return ftyp + mdat + moov


def test_the_length_comes_from_the_video_file(tmp_path):
    short = tmp_path / "short.mp4"
    short.write_bytes(_mp4(1000, 38_100))
    assert import_reels.mp4_duration_seconds(short) == 38.1
    long = tmp_path / "long.mp4"
    long.write_bytes(_mp4(90_000, 14_040_000, version=1))
    assert import_reels.mp4_duration_seconds(long) == 156.0
    broken = tmp_path / "broken.mp4"
    broken.write_bytes(b"\x00\x00\x00\x10ftypisom\x00\x00\x00\x00")
    try:
        import_reels.mp4_duration_seconds(broken)
    except ValueError:
        pass
    else:
        raise AssertionError("a file without a length must be refused")


def test_load_reels_keeps_instagrams_order_and_skips_photos(tmp_path):
    posts = [
        {"id": "3", "type": "video", "date": "2026-06-21", "title": "Later that day.", "caption": "Later that day.",
         "spoken_text": " Said. ", "file": "media/3.mp4", "poster": "media/3.jpg", "width": 720, "height": 1280, "duration_s": 6},
        {"id": "2", "type": "video", "date": "2026-06-21", "title": "Earlier.", "caption": "Earlier.",
         "spoken_text": "", "file": "media/2.mp4", "poster": "media/2.jpg", "width": 720, "height": 1280, "duration_s": 6},
        {"id": "9", "type": "photo", "date": "2026-06-20", "title": "A photo.", "caption": "A photo.",
         "file": "media/9.webp", "poster": None},
        {"id": "1", "type": "video", "date": "2026-05-01", "title": "Oldest.", "caption": "Oldest.",
         "spoken_text": None, "file": "media/1.mp4", "poster": "media/1.jpg", "width": 360, "height": 640, "duration_s": 6},
    ]
    (tmp_path / "posts.json").write_text(json.dumps(posts), encoding="utf-8")
    reels = import_reels.load_reels(tmp_path)
    assert [reel.key for reel in reels] == ["ig-3", "ig-2", "ig-1"]
    assert reels[0].published_at.isoformat() == "2026-06-21T12:00:00+00:00"
    assert reels[1].published_at.isoformat() == "2026-06-21T11:59:59+00:00"
    assert reels[2].published_at.isoformat() == "2026-05-01T12:00:00+00:00"
    assert [reel.transcript for reel in reels] == ["Said.", None, None]
    assert reels[0].description is None


def test_load_reels_leaves_out_the_older_post_of_a_repeated_video(tmp_path):
    older, newer = next(iter(import_reels.REPEATED_VIDEOS.items()))
    posts = [
        {"id": newer, "type": "video", "date": "2025-08-17", "title": "Hard truth.", "caption": "Hard truth.",
         "spoken_text": "Hard truth. Drop it below and follow me for more.", "file": "media/n.mp4", "poster": "media/n.jpg"},
        {"id": older, "type": "video", "date": "2025-08-15", "title": "Hard truth.", "caption": "Hard truth.",
         "spoken_text": "Hard truth.", "file": "media/o.mp4", "poster": "media/o.jpg"},
    ]
    (tmp_path / "posts.json").write_text(json.dumps(posts), encoding="utf-8")
    reels = import_reels.load_reels(tmp_path)
    assert [reel.key for reel in reels] == [f"ig-{newer}"]
    assert reels[0].transcript == "Hard truth."
    assert len(import_reels.REPEATED_VIDEOS) == 2
    # No newer post that stays is itself left out.
    assert not set(import_reels.REPEATED_VIDEOS) & set(import_reels.REPEATED_VIDEOS.values())


def test_a_reel_is_finished_only_when_a_run_stopped_before_showing_it():
    assert import_reels.needs_finishing({"enabled": False, "cover_url": None})
    assert not import_reels.needs_finishing({"enabled": False, "cover_url": "https://x/c.webp"})
    assert not import_reels.needs_finishing({"enabled": True, "cover_url": None})


def test_the_sign_in_from_the_environment_is_for_the_local_stack_only():
    assert import_reels.Site("http://localhost:8000").is_local
    assert import_reels.Site("http://127.0.0.1:8000").is_local
    assert not import_reels.Site(import_reels.LIVE_SITE).is_local
