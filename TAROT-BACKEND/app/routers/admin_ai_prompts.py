"""Admin — AI Prompts. The control room for every AI prompt on the platform:
view, edit (with version history + restore), restore default, and run a live
test against the real model. All behind MANAGE_SETTINGS (superadmin)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_superadmin
from app.services.ai import client as ai_client
from app.services.ai import registry

router = APIRouter(dependencies=[Depends(require_superadmin)])


class PromptSave(BaseModel):
    prompt: str
    model: Optional[str] = None


class PromptTest(BaseModel):
    variables: Optional[dict] = None


class PromptActivate(BaseModel):
    version: int | None = None


def _to_detail(p) -> dict:
    draft = next((version for version in p.versions if version.state == "DRAFT"), None)
    editable = registry.is_prompt_editable(p)
    return {
        "key": p.key,
        "name": p.name,
        "description": p.description,
        "model": p.model,
        "default_model": p.default_model,
        "available_models": registry.configured_models() if editable else [],
        "model_editable": editable,
        "model_lock_reason": None if editable else (
            "This prompt is protected. Its model stays read-only until the prompt's ownership scope is explicitly unlocked."
        ),
        "prompt": p.prompt,
        "default_prompt": p.default_prompt,
        "variables": p.variables or [],
        "output_schema": p.output_schema,
        "output_schema_version": p.output_schema_version,
        "classification": p.classification,
        "status": p.status,
        "active_version": p.active_version,
        "draft_version": p.draft_version,
        "draft_prompt": draft.text if draft else None,
        "draft_model": draft.model if draft else None,
        "char_count": len(p.prompt or ""),
        "last_run_at": p.last_run_at.isoformat() if p.last_run_at else None,
        "last_run_status": p.last_run_status,
    }


@router.get("/ai-prompts")
def list_ai_prompts(db: Session = Depends(get_db)):
    rows = registry.list_prompts(db)
    items = [
        {
            "key": p.key,
            "name": p.name,
            "description": p.description,
            "model": p.model,
            "status": p.status,
            "classification": p.classification,
            "active_version": p.active_version,
            "draft_version": p.draft_version,
            "last_run_at": p.last_run_at.isoformat() if p.last_run_at else None,
            "last_run_status": p.last_run_status,
        }
        for p in rows
    ]
    return JSONResponse(content=jsonable_encoder({"items": items, "configured": ai_client.is_configured()}))


@router.get("/ai-prompts/{key}")
def get_ai_prompt(key: str, db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=jsonable_encoder(_to_detail(registry.get_prompt(db, key))))
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt not found")


@router.put("/ai-prompts/{key}")
def save_ai_prompt(key: str, payload: PromptSave, db: Session = Depends(get_db)):
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    try:
        p = registry.save_prompt(db, key, payload.prompt, payload.model)
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt not found")
    except registry.PromptProtectedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except registry.PromptValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return JSONResponse(content=jsonable_encoder(_to_detail(p)))


@router.put("/ai-prompts/{key}/draft")
def save_ai_prompt_draft(key: str, payload: PromptSave, db: Session = Depends(get_db)):
    try:
        registry.save_draft(db, key, payload.prompt, payload.model)
        prompt = registry.get_prompt(db, key)
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt not found")
    except registry.PromptProtectedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except registry.PromptValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return JSONResponse(content=jsonable_encoder(_to_detail(prompt)))


@router.post("/ai-prompts/{key}/activate")
def activate_ai_prompt(
    key: str, payload: PromptActivate, db: Session = Depends(get_db)
):
    try:
        prompt = registry.activate_draft(db, key, payload.version)
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt or draft version not found")
    except registry.PromptProtectedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except registry.PromptValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return JSONResponse(content=jsonable_encoder(_to_detail(prompt)))


@router.post("/ai-prompts/{key}/restore-default")
def restore_ai_prompt_default(key: str, db: Session = Depends(get_db)):
    try:
        p = registry.restore_default(db, key)
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt not found")
    except registry.PromptProtectedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    return JSONResponse(content=jsonable_encoder(_to_detail(p)))


@router.get("/ai-prompts/{key}/versions")
def get_ai_prompt_versions(key: str, db: Session = Depends(get_db)):
    try:
        versions = registry.get_versions(db, key)
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt not found")
    items = [
        {
            "id": v.id,
            "version": v.version,
            "text": v.text,
            "model": v.model,
            "state": v.state,
            "char_count": len(v.text or ""),
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "activated_at": v.activated_at.isoformat() if v.activated_at else None,
        }
        for v in versions
    ]
    return JSONResponse(content=jsonable_encoder({"items": items}))


@router.post("/ai-prompts/{key}/versions/{version_id}/restore")
def restore_ai_prompt_version(key: str, version_id: int, db: Session = Depends(get_db)):
    try:
        p = registry.restore_version(db, key, version_id)
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt or version not found")
    except registry.PromptProtectedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    return JSONResponse(content=jsonable_encoder(_to_detail(p)))


@router.post("/ai-prompts/{key}/versions/{version_number}/rollback")
def rollback_ai_prompt_version(
    key: str, version_number: int, db: Session = Depends(get_db)
):
    try:
        prompt = registry.rollback_to_version(db, key, version_number)
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt or version not found")
    except registry.PromptProtectedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except registry.PromptValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return JSONResponse(content=jsonable_encoder(_to_detail(prompt)))


# Sample values used to fill any variable the tester didn't supply.
_SAMPLE = {"zodiac_sign": "Cancer", "date": "2026-07-07", "card_name": "The Star"}


@router.post("/ai-prompts/{key}/test")
def test_ai_prompt(key: str, payload: PromptTest, db: Session = Depends(get_db)):
    """Run the prompt against its real model with sample inputs and return the
    raw output — so the owner can iterate on wording without a scheduled job."""
    try:
        prompt = registry.get_prompt(db, key)
    except registry.PromptNotFound:
        raise HTTPException(status_code=404, detail="Prompt not found")

    if not ai_client.is_configured():
        raise HTTPException(status_code=400, detail=str(ai_client.AiNotConfigured()))

    supplied = payload.variables or {}
    variables = {}
    for v in prompt.variables or []:
        name = v.get("name")
        variables[name] = supplied.get(name) or _SAMPLE.get(name, f"<{name}>")

    text = registry.render(db, key, **variables)
    try:
        result = ai_client.run_prompt(text, prompt.model)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Model call failed: {e}")
    return JSONResponse(content=jsonable_encoder({"variables": variables, **result}))
