from typing import List
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.landing_content import LandingContent


def get_all_sections(db: Session) -> List[LandingContent]:
    stmt = select(LandingContent)
    return list(db.scalars(stmt))


def get_section(db: Session, section: str) -> LandingContent:
    stmt = select(LandingContent).where(LandingContent.section == section)
    entry = db.scalar(stmt)
    if entry is None:
        raise HTTPException(
            status_code=404, detail=f"Landing section '{section}' not found"
        )
    return entry


def upsert_section(db: Session, section: str, content: dict) -> LandingContent:
    stmt = select(LandingContent).where(LandingContent.section == section)
    entry = db.scalar(stmt)
    if entry:
        entry.content = content
    else:
        entry = LandingContent(section=section, content=content)
        db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
