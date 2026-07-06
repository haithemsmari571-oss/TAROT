"""Daily spiritual content — placeholder engine (Step 4).

Serves one card + interpretation + manifestation + ritual + quote line per
zodiac sign per day, in Valentina's voice. Right now the text comes from a
believable placeholder pool; the nightly Claude generation job (a later step)
will write rows into the SAME ``daily_content`` table with ``source="generated"``
and these pages won't change at all.

``get_daily_content`` is get-or-create and deterministic per (sign, date): the
first read of the day for a sign persists a row, so everyone with that sign sees
the same "card the universe dealt" that day, and it stays stable if they refresh.
"""

import hashlib
from datetime import date
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models import DailyContent

logger = get_logger(__name__)

# Placeholder card pool. card_key matches an available tarot image asset in the
# frontend. Every interpretation ends on an open loop the paid reading resolves
# (Section 4 of the spec). {sign} is woven in so the day feels personal.
CARD_POOL = [
    {
        "card_key": 0,
        "card_name": "The Fool",
        "interpretation": "A door you've been circling is finally ajar, {sign}. The Fool doesn't ask you to be certain — only willing. Something light wants to begin in you today, but it needs one honest yes. What that first step actually is depends on what you're ready to leave behind.",
        "manifestation": "I trust the next small step, even before I can see the whole staircase.",
        "ritual": "Before you check your phone this morning, take three slow breaths and name one thing you're curious about.",
        "quote_line": "Beginnings don't need permission — only courage.",
    },
    {
        "card_key": 1,
        "card_name": "The Magician",
        "interpretation": "You already hold more than you think, {sign}. The Magician is the reminder that the tools are in your hands, not on their way. Today asks you to use one of them deliberately. Which one matters most right now is the question only your situation can answer.",
        "manifestation": "What I need, I already carry. Today I use it on purpose.",
        "ritual": "Write down one skill or strength you have, and one place you'll use it today.",
        "quote_line": "The magic was never out there. It was in your hands.",
    },
    {
        "card_key": 2,
        "card_name": "The High Priestess",
        "interpretation": "There's a knowing under your noise today, {sign}. The High Priestess doesn't shout; she waits for you to get quiet enough to hear her. A feeling you've been talking yourself out of is worth listening to. What it's trying to protect is something only you can name.",
        "manifestation": "I honour the quiet voice that knew before I did.",
        "ritual": "Sit in silence for two minutes and notice the first feeling that surfaces — don't fix it, just greet it.",
        "quote_line": "Your intuition was right before you had the words.",
    },
    {
        "card_key": 4,
        "card_name": "The Emperor",
        "interpretation": "Structure is a form of love today, {sign}. The Emperor asks where a little order would free you, not cage you. One boundary, one decision, one line drawn — that's the work. Where exactly to draw it is the tender part, and it depends on what you've been tolerating.",
        "manifestation": "I build the walls that keep my peace, and the doors that let love in.",
        "ritual": "Name one 'yes' you've been giving that should be a 'no', and say it out loud once.",
        "quote_line": "Boundaries aren't distance — they're self-respect.",
    },
    {
        "card_key": 5,
        "card_name": "The Hierophant",
        "interpretation": "You're being asked what you actually believe, {sign} — not what you were handed. The Hierophant sits between old wisdom and your own truth. Something you inherited is ready to be questioned or kept on purpose. Which one it is today is a conversation only you can have.",
        "manifestation": "I keep what is true for me and release what was only ever borrowed.",
        "ritual": "Think of one 'rule' you live by and ask: is this mine, or did I just never question it?",
        "quote_line": "Tradition is a question, not a cage.",
    },
    {
        "card_key": 17,
        "card_name": "The Star",
        "interpretation": "After a stretch of holding your breath, the Star lets you exhale, {sign}. Hope is coming back online quietly — not as a promise, but as a possibility. There's healing available if you'll let yourself receive it. What's been depleting you is the thread worth pulling next.",
        "manifestation": "I let hope return gently, on its own soft schedule.",
        "ritual": "Step outside or to a window tonight and find one point of light. Let it hold your wish for a moment.",
        "quote_line": "Even a small light is proof the dark isn't everything.",
    },
    {
        "card_key": 18,
        "card_name": "The Moon",
        "interpretation": "Not everything is as it appears today, {sign}. The Moon asks you to move slowly through a fog rather than pretend you can see clearly. A worry may be louder than it is true. What's real underneath the fear is exactly what a closer look would reveal.",
        "manifestation": "I move gently through uncertainty and trust the ground to meet my feet.",
        "ritual": "Write down one fear, then next to it write one fact you actually know for certain.",
        "quote_line": "Fear exaggerates. Truth is usually kinder.",
    },
    {
        "card_key": 19,
        "card_name": "The Sun",
        "interpretation": "A warmth wants to reach you today, {sign} — permission to feel good without bracing for the catch. The Sun clears the sky for a while. Let yourself be seen in something that's going right. Where to let that light land is the part your heart already knows.",
        "manifestation": "I allow good things to be simply good, with no fine print.",
        "ritual": "Send one message today that celebrates someone — or yourself — out loud.",
        "quote_line": "Joy doesn't have to be earned to be allowed.",
    },
    {
        "card_key": 6,
        "card_name": "The Lovers",
        "interpretation": "A choice of the heart is asking for your honesty, {sign}. The Lovers isn't only about romance — it's about alignment, about choosing what's truly yours. Something wants a clear answer from you. What you actually want, underneath what's expected, is the whole question.",
        "manifestation": "I choose from love, not from fear of being alone.",
        "ritual": "Place a hand on your chest and ask one relationship question. Notice whether your body softens or tightens.",
        "quote_line": "The right choice usually feels like relief, not performance.",
    },
    {
        "card_key": 3,
        "card_name": "The Empress",
        "interpretation": "Tend to yourself the way you'd tend to someone you love, {sign}. The Empress is abundance through care, not force. Something in your life is ready to grow if you'll nourish rather than push it. What needs feeding first is the quiet thing you keep putting last.",
        "manifestation": "I grow what I nurture, so today I nurture what matters.",
        "ritual": "Do one small nourishing thing just for you — a proper meal, a walk, a moment in the sun.",
        "quote_line": "You bloom in the places you finally water.",
    },
    {
        "card_key": 9,
        "card_name": "The Hermit",
        "interpretation": "You need a little solitude to hear yourself think, {sign}. The Hermit isn't lonely — he's clear. Stepping back from the noise isn't avoidance today, it's wisdom. The answer you're chasing outside is waiting in the quiet you keep avoiding.",
        "manifestation": "I give myself the quiet I need to find my own answer.",
        "ritual": "Take ten minutes alone with no screen. Just you and one honest question.",
        "quote_line": "Sometimes the way forward is a step inward.",
    },
    {
        "card_key": 10,
        "card_name": "Wheel of Fortune",
        "interpretation": "The wheel is turning, {sign}, and you're not meant to stop it — only to notice which way to lean. A cycle is closing so another can open. Something that felt stuck is about to move. Where it's carrying you depends on the grip you're finally willing to loosen.",
        "manifestation": "I release my grip and let the turning carry me somewhere better.",
        "ritual": "Name one thing you've been clenching. Unclench your hands as you say you're willing to let it move.",
        "quote_line": "What's leaving is making room for what's arriving.",
    },
    {
        "card_key": 14,
        "card_name": "Temperance",
        "interpretation": "The medicine today is the middle path, {sign}. Temperance blends what felt like opposites into something you can actually live with. You don't have to choose all-or-nothing. The exact balance you're looking for is closer than the extremes keep telling you.",
        "manifestation": "I find the gentle middle where peace actually lives.",
        "ritual": "Where you've been all-or-nothing, name the small 'both' that could work instead.",
        "quote_line": "Balance isn't boring — it's where you can finally breathe.",
    },
    {
        "card_key": 21,
        "card_name": "The World",
        "interpretation": "A chapter is quietly completing itself, {sign}. The World isn't a finish line so much as a full breath — the moment you realise how far you've actually come. Something is ready to be acknowledged as done. What you carry forward from it is the part only you can choose.",
        "manifestation": "I honour how far I've come before I rush toward what's next.",
        "ritual": "Name one thing you've completed or survived, and let yourself feel a moment of quiet pride.",
        "quote_line": "Endings, when you're ready for them, feel like arriving.",
    },
]


def _pick_index(sign: str, on_date: date) -> int:
    """Deterministic, stable-per-day pick so a sign gets the same card all day."""
    seed = f"{on_date.isoformat()}|{sign}".encode()
    return int(hashlib.sha256(seed).hexdigest(), 16) % len(CARD_POOL)


def get_daily_content(
    db: Session, sign: str, on_date: date
) -> DailyContent:
    """Get-or-create the day's content for a sign. Idempotent and safe under
    concurrency (unique constraint + re-read on race)."""
    existing = (
        db.query(DailyContent)
        .filter(
            DailyContent.content_date == on_date,
            DailyContent.zodiac_sign == sign,
        )
        .first()
    )
    if existing:
        return existing

    template = CARD_POOL[_pick_index(sign, on_date)]
    row = DailyContent(
        content_date=on_date,
        zodiac_sign=sign,
        card_key=template["card_key"],
        card_name=template["card_name"],
        interpretation=template["interpretation"].format(sign=sign),
        manifestation=template["manifestation"],
        ritual=template["ritual"],
        quote_line=template["quote_line"],
        source="placeholder",
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
        logger.info(
            "daily_content_created", zodiac_sign=sign, on_date=on_date.isoformat()
        )
        return row
    except IntegrityError:
        # Another request created it first — use theirs.
        db.rollback()
        return (
            db.query(DailyContent)
            .filter(
                DailyContent.content_date == on_date,
                DailyContent.zodiac_sign == sign,
            )
            .first()
        )
