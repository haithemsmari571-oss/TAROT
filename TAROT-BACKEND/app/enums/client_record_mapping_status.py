import enum


class ClientRecordMappingStatus(enum.Enum):
    """Review state of a tarot-client → vault-record mapping proposal.

    - PENDING: auto-matched by the scanner, NOT yet human-reviewed. Never used
      by draft generation.
    - CONFIRMED: a human reviewed and approved the match. The only state the
      reading pipeline ever acts on.
    - REJECTED: a human reviewed and refused the match. Kept (not deleted) so
      the scanner never re-proposes the same wrong match.
    """

    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
