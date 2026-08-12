"""Single source location and registry metadata for the Atlas summary instruction."""
from pathlib import Path


ATLAS_CLIENT_MEMORY_PROMPT_KEY = "atlas.client-memory-summary"
ATLAS_CLIENT_MEMORY_INSTRUCTION_VERSION = "post-session-summary-v1"
ATLAS_CLIENT_MEMORY_INSTRUCTION_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "atlas_client_memory_summary.txt"
)


def load_shipped_atlas_client_memory_instruction() -> str:
    return ATLAS_CLIENT_MEMORY_INSTRUCTION_PATH.read_text(encoding="utf-8").strip()
