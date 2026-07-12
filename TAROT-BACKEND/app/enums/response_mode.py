import enum


class ResponseMode(enum.Enum):
    """Who answers the client during a live reading, per conversation.

    - HUMAN: no automation. The reader (or an admin connected as the reader)
      types every reply. Unchanged legacy behaviour.
    - HYBRID: Valentina drafts and Sabri checks, but the result ALWAYS goes to
      the admin panel for review/edit/send — never auto-sent.
    - SABRI: the full auto loop. Valentina drafts, Sabri checks; on a clean pass
      the reply is auto-sent as the reader. If Sabri still fails after the retry
      cap, the draft falls back to the admin panel for manual review.
    """

    HUMAN = "HUMAN"
    HYBRID = "HYBRID"
    SABRI = "SABRI"
