import enum


class Gender(str, enum.Enum):
    """The client's gender, as she states it herself.

    Collected because the reader was assuming it. A woman asked about her situation and the
    reading came back about a man she was supposedly waiting on, in front of the owner, on the
    live site. Nothing in the system had ever been told otherwise, so the model filled the gap
    with the likeliest guess, which is what models do with gaps.

    NOT_STATED is a real answer, not a missing one, and is treated as such everywhere: the
    reading prompt says "not stated" out loud rather than leaving the line out, because a
    missing line reads as "no information" and invites the same guess all over again.
    """

    WOMAN = "WOMAN"
    MAN = "MAN"
    OTHER = "OTHER"
    NOT_STATED = "NOT_STATED"

    @property
    def label(self) -> str:
        """How it is written to a human — the reader, the cockpit, the client's own screen."""
        return {
            Gender.WOMAN: "woman",
            Gender.MAN: "man",
            Gender.OTHER: "other",
            Gender.NOT_STATED: "not stated",
        }[self]
