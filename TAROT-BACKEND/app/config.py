from functools import lru_cache
from pathlib import Path
from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    ENVIRONMENT: str = "dev"

    @field_validator("ENVIRONMENT")
    @classmethod
    def normalize_environment(cls, v):
        mapping = {"production": "prod", "development": "dev"}
        return mapping.get(v.lower(), v.lower())

    RESET_PASSWORD_BASE_URL: str = "https://askvalentina.co.uk/reset-password"
    VERIFY_ACCOUNT_BASE_URL: str = "https://askvalentina.co.uk/api/auth/verify-account"
    VERIFY_ACCOUNT_REDIRECT_URL: str = "https://askvalentina.co.uk/verify-account"

    DATABASE_URL: str = "postgresql://tarot:tarot@localhost:5432/tarot"

    MAIL_USERNAME: str = "support@askvalentina.co.uk"
    MAIL_PASSWORD: str = "BarCoffeeMirror21@"
    MAIL_FROM: str = "support@askvalentina.co.uk"
    MAIL_PORT: int = 465
    MAIL_SERVER: str = "mail.privateemail.com"
    MAIL_ENCRYPTION: str = "tls"

    JWT_SECRET_KEY: str = (
        "b3bdc70d9d8fb5594b135a7a45d148ab51947cb29508655af27ff84e7492b257"
    )
    JWT_ALGORITHM: str = "HS256"
    # 24h. Production sets its own value via env; this default is deliberately
    # sane (not 9999) so a long-lived token can never ship by omission.
    JWT_TOKEN_EXPIRE_MINUTES: int = 1440

    APP_BASE_URL: str = "https://askvalentina.co.uk/api"
    FRONT_BASE_URL: str = "https://askvalentina.co.uk/"

    MEDIA_DIR: Path = Path("media/uploads")

    SOCKET_AUTH_TIMEOUT: int = 60

    STRIPE_ENDPOINT_SECRET: str = ""
    STRIPE_API_KEY: str = ""

    # Claude API key for the nightly content engine + AI Prompt "Run test".
    # Paste your key from console.anthropic.com into TAROT-BACKEND/.env as
    # ANTHROPIC_API_KEY=sk-ant-... — never commit it, never expose to frontend.
    ANTHROPIC_API_KEY: str = ""
    # Model for the content engine (Claude Haiku — cheap, fast).
    CONTENT_MODEL: str = "claude-haiku-4-5-20251001"
    # Cost guard: hard ceiling on total tokens per nightly run.
    CONTENT_RUN_TOKEN_BUDGET: int = 200_000
    # Hour (UTC) the nightly job runs to prepare the NEXT day's content.
    CONTENT_JOB_HOUR_UTC: int = 3

    # ── AI reading pipeline (Valentina generates, Sabri directs delivery, Atlas remembers) ──
    # Master switch. Default ON — there is no live traffic to protect yet. Flip
    # to false to fully disable the reading pipeline and the Atlas auto-summary.
    AI_DRAFTING_ENABLED: bool = True
    # Valentina (psychic reading engine) — Sonnet-tier, env-configurable. Same
    # pattern as CAMPAIGN_DRAFT_MODEL in the secondbrain CRM project. Full 4-part
    # readings are long, so the token ceiling is generous.
    READING_DRAFT_MODEL: str = "claude-sonnet-4-6"
    READING_DRAFT_MAX_TOKENS: int = 4096
    # Sabri (delivery director) — fast model, env-configurable. Emits a full
    # delivery queue that reproduces AND fragments Valentina's whole reading into
    # many JSON messages, so it needs at least as much room as Valentina's output.
    SABRI_CHECK_MODEL: str = "claude-haiku-4-5-20251001"
    SABRI_CHECK_MAX_TOKENS: int = 6144
    # Cap on Valentina↔Sabri correction rounds; after this Sabri delivers from
    # the best available output rather than requesting another regeneration.
    SABRI_MAX_ATTEMPTS: int = 3
    # Tighter cap for micro-reads (greetings/short replies). Sabri's quality gate
    # tends to spin on a two-word greeting where there is nothing to correct, so a
    # micro-read is force-delivered after this many Valentina drafts (1 original +
    # 1 correction) regardless of the gate. Prompt wording can't fix this reliably.
    SABRI_MICRO_MAX_ATTEMPTS: int = 2
    # ── Reading engine selector ──────────────────────────────────────────────
    # "two_agent" = the current Valentina(draft)↔Sabri(direct) pipeline.
    # "single_agent" = the new streaming Reader (one Opus call in final voice; the
    # deterministic return-ack strip + delivery guarantee run on its output).
    # Cutover 2026-07-13: A/B cleared single_agent (quality + latency + 0 leaks),
    # so the default is now single_agent. Rollback: set READING_ENGINE=two_agent in
    # the prod .env and restart (instant), or revert this line and redeploy.
    READING_ENGINE: str = "single_agent"
    # The single-agent Reader (only used when READING_ENGINE=single_agent). Opus for
    # the A/B — we want to see the quality ceiling before considering a cheaper tier.
    # Verified callable on this key before switching (2026-07-13).
    READER_MODEL: str = "claude-opus-4-6"
    # Ceiling for the streamed Reader turn. Generous because extended thinking
    # (gated on to substantive turns) shares this output budget with the reading —
    # a tight cap would truncate a full reading after the model spent tokens
    # thinking. Streaming, so a large ceiling carries no HTTP-timeout risk.
    READER_MAX_TOKENS: int = 16000
    # Bounded retry if the Reader returns empty/malformed output (the single-agent
    # analog of the correction-loop cap: never spin, always deliver something).
    READER_MAX_ATTEMPTS: int = 2
    # ── Buffered paced reveal (landingpage2 rhythm) ──────────────────────────
    # The Reader's FULL reply is generated invisibly first, then revealed one bubble
    # at a time with these delays (real generation time is NOT part of the pacing):
    #   * "reading her message" beat before the first bubble, typing indicator HIDDEN
    #     (distinct from the "typing" beat) — simulates her reading what was sent.
    #   * per-bubble typing delay ≈ REVEAL_PER_WORD_MS × words, clamped [min, max].
    #   * a short gap between consecutive bubbles.
    REVEAL_READING_PAUSE_MS: int = 2000
    REVEAL_PER_WORD_MS: int = 1500
    REVEAL_MIN_TYPING_MS: int = 900
    REVEAL_MAX_TYPING_MS: int = 4500
    REVEAL_BETWEEN_BUBBLES_MS: int = 500
    # Cheap model for the continue-vs-redirect tie-break on the genuinely ambiguous
    # mid-reveal client messages the heuristic can't classify. Only ever decides
    # continue-vs-redirect — it NEVER reviews or corrects the Reader's writing.
    READER_CLASSIFIER_MODEL: str = "claude-haiku-4-5-20251001"
    # Atlas (dossier auto-summary at session end) — Haiku-tier is plenty.
    ATLAS_SUMMARY_MODEL: str = "claude-haiku-4-5-20251001"
    ATLAS_SUMMARY_MAX_TOKENS: int = 512

    # ── Delivery execution (typing simulation + pacing between messages) ──
    # Typing-indicator duration: ~ms per character, with ±randomness, clamped so
    # a long line never produces an absurd wait.
    READING_TYPING_MS_PER_CHAR: int = 35
    READING_TYPING_MIN_MS: int = 1500
    READING_TYPING_MAX_MS: int = 12000
    # Gap between consecutive sends, by the item's pacing flag (min/max ms; a
    # value is drawn uniformly in range). send_now is a single minimal gap.
    READING_SEND_NOW_GAP_MS: int = 400
    READING_PAUSE_SHORT_MIN_MS: int = 2000
    READING_PAUSE_SHORT_MAX_MS: int = 5000
    READING_PAUSE_LONG_MIN_MS: int = 6000
    READING_PAUSE_LONG_MAX_MS: int = 15000
    # If the pre-plan phase (Sabri+Valentina) runs longer than this, send a short
    # holding line so the client isn't left in silence while the reading generates.
    READING_HOLD_MESSAGE_DELAY_SEC: float = 6.0

    BILLING_TASK_MAX_RETRIES: int = 3
    BILLING_TASK_RETRY_DELAY_SECONDS: int = 5

    # Session Manager Settings
    SESSION_MINIMUM_BALANCE_SECONDS: int = 60  # Require 60 seconds worth of balance
    # Wait this long for a dropped client to reconnect before auto-ending. Must
    # exceed the AI reading latency (~140s to first delivery) so a mobile client
    # whose socket blips while waiting for a reply isn't killed mid-reading.
    SESSION_CLIENT_DISCONNECT_TIMEOUT: int = 180
    SESSION_CHECK_INTERVAL_NORMAL: int = 5  # Check every 5s normally
    SESSION_CHECK_INTERVAL_CRITICAL: int = 1  # Check every 1s when < 30s remaining
    SESSION_CRITICAL_THRESHOLD: int = 30  # Switch to critical mode at 30s remaining

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_app_settings() -> AppSettings:
    return AppSettings()
