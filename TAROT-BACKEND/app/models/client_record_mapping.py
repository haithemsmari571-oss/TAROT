from datetime import datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.enums.client_record_mapping_status import ClientRecordMappingStatus
from app.models.base import Base


class ClientRecordMapping(Base):
    """Link between a tarot client (users.id) and one file in the Second Brain
    CRM's client-records vault (a local markdown folder this backend only READS).

    Rows are created by the auto-matcher as PENDING proposals and become usable
    only after a human confirms them (status → CONFIRMED). Draft generation
    ignores everything except CONFIRMED — an unreviewed guess must never shape
    a real reading. REJECTED rows are kept so the scanner won't re-propose the
    same wrong match. One mapping per tarot client (user_id is unique).

    ``vault_client_uid`` is the deterministic ID derived from the vault file:
    "<file-slug>-<DOB as YYYYMMDD>" (e.g. "christine-radinger-19850825"), or
    "<file-slug>-dob-unknown" when the record has no extractable full DOB.
    ``match_method``/``match_score``/``dob_tier`` record HOW the proposal was
    made ("name+dob" vs the weaker "name_only") so the reviewer can judge it.
    """

    __tablename__ = "client_record_mappings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    vault_filename: Mapped[str] = mapped_column(Text, nullable=False)   # e.g. "christine.md"
    vault_client_uid: Mapped[str] = mapped_column(Text, nullable=False)
    vault_dob: Mapped[Optional[object]] = mapped_column(Date, nullable=True)
    dob_tier: Mapped[str] = mapped_column(Text, nullable=False, default="none")
    match_method: Mapped[str] = mapped_column(Text, nullable=False)     # name+dob | name_only
    match_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, default=ClientRecordMappingStatus.PENDING.value
    )
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # created_at / updated_at come from Base.
