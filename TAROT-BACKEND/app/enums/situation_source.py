import enum


class SituationSource(str, enum.Enum):
    """Where a client situation record's latest update came from.

    DETERMINISTIC — the zero-API regex/keyword extractor (Track A phase A1).
    AI_DELTA      — the richer LLM-derived delta (A-LIVE, not built yet).
    HUMAN         — a manual operator edit.
    """

    DETERMINISTIC = "DETERMINISTIC"
    AI_DELTA = "AI_DELTA"
    HUMAN = "HUMAN"
