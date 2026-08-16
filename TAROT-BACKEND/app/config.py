from functools import lru_cache
from pathlib import Path
from pydantic import field_validator, model_validator
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

    MAIL_USERNAME: str
    MAIL_PASSWORD: str
    MAIL_FROM: str
    MAIL_PORT: int
    MAIL_SERVER: str
    MAIL_STARTTLS: bool
    MAIL_SSL_TLS: bool
    MAIL_USE_CREDENTIALS: bool = True
    MAIL_VALIDATE_CERTS: bool = True
    MAIL_DEBUG: bool = False

    JWT_SECRET_KEY: str

    @field_validator(
        "MAIL_USERNAME",
        "MAIL_PASSWORD",
        "MAIL_FROM",
        "MAIL_SERVER",
        "JWT_SECRET_KEY",
        mode="before",
    )
    @classmethod
    def require_security_setting(cls, value, info):
        """Reject missing/blank security settings; committed source has no fallback."""
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{info.field_name} must be provided via environment variable")
        return value

    @field_validator("MAIL_PORT")
    @classmethod
    def require_valid_mail_port(cls, value):
        if not 1 <= value <= 65535:
            raise ValueError("MAIL_PORT must be between 1 and 65535")
        return value

    @model_validator(mode="after")
    def require_secure_production_mail_transport(self):
        """Reject ambiguous or weakened SMTP transport settings in production."""
        if self.ENVIRONMENT != "prod":
            return self
        if self.MAIL_STARTTLS == self.MAIL_SSL_TLS:
            raise ValueError(
                "Production email must enable exactly one of "
                "MAIL_STARTTLS or MAIL_SSL_TLS"
            )
        if not self.MAIL_USE_CREDENTIALS:
            raise ValueError("MAIL_USE_CREDENTIALS must be enabled in production")
        if not self.MAIL_VALIDATE_CERTS:
            raise ValueError("MAIL_VALIDATE_CERTS must be enabled in production")
        if self.MAIL_DEBUG:
            raise ValueError("MAIL_DEBUG must be disabled in production")
        return self

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
    # Local-only Atlas dossier handoff. The URL is overridable for another local
    # environment; the shared key has no value in source and must come from env.
    ATLAS_DOSSIER_BASE_URL: str = "http://127.0.0.1:4317"
    ATLAS_INTERNAL_KEY: str = ""
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
    # "two_agent" = the retired Valentina(draft)↔Sabri(JSON quality-gate) pipeline.
    # "single_agent" = the one-Opus-call Reader (final voice; deterministic return-ack strip +
    # delivery guarantee on its output). Was the live prod default; now the rollback target.
    # "two_role" = Valentina writes a complete reading / Sabri curates + holds the majority in
    # reserve + rewrites to texting voice (facts verbatim) + paces; deterministic ≤26-word message
    # chunker, proportional reveal, numerology injection + return-ack strip + fact check carried over.
    # Branch cutover (single-agent-reader): default flipped to two_role to stage the next go-live.
    # NOT yet deployed — main/prod still run single_agent until this branch is deployed with sign-off.
    # Rollback after deploy: set READING_ENGINE=single_agent in the prod .env and restart (instant),
    # or revert this line and redeploy.
    READING_ENGINE: str = "two_role"
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
    # The Reader's FULL reply is generated invisibly first (the typing indicator is
    # shown the whole time — she is "reading + composing", never dead silence), then
    # revealed one bubble at a time with these delays (real generation time is NOT
    # part of the reveal pacing):
    #   * per-bubble typing delay ≈ REVEAL_PER_WORD_MS × words, clamped [min, max].
    #   * a short gap between consecutive bubbles.
    REVEAL_PER_WORD_MS: int = 1500
    REVEAL_MIN_TYPING_MS: int = 900
    REVEAL_MAX_TYPING_MS: int = 4500
    REVEAL_BETWEEN_BUBBLES_MS: int = 500
    # Long readings speed up: at or below REVEAL_FULL_PACE_BUBBLES the per-bubble delay
    # + gap are unscaled; beyond it they shrink by REVEAL_FULL_PACE_BUBBLES / n (like a
    # person quickening through a long explanation), floored at REVEAL_MIN_SPEED_FACTOR.
    # This keeps a long reading's total reveal roughly bounded instead of ~5s × n.
    REVEAL_FULL_PACE_BUBBLES: int = 8
    REVEAL_MIN_SPEED_FACTOR: float = 0.35
    # Cheap model for the continue-vs-redirect tie-break on the genuinely ambiguous
    # mid-reveal client messages the heuristic can't classify. Only ever decides
    # continue-vs-redirect — it NEVER reviews or corrects the Reader's writing.
    READER_CLASSIFIER_MODEL: str = "claude-haiku-4-5-20251001"
    # ── Two-role engine (READING_ENGINE=two_role): Valentina writes / Sabri delivers ──
    # Valentina (writer) reuses READER_MODEL (Opus 4.6) + the gated thinking gate — she
    # writes ONE complete, rich reading/reply as prose per turn, no chunking/voice/pacing.
    # Sabri (delivery director) is a SECOND real model call: he curates (select + hold in
    # reserve), rewrites the selected parts into texting voice PRESERVING every fact/number/
    # name verbatim, and chunks into ~a natural turn. Plain-text I/O (bubbles + @@RESERVE@@),
    # never JSON; no correction/redo loop — this is NOT the retired two_agent quality-gate.
    SABRI_DELIVERY_MODEL: str = "claude-sonnet-4-6"
    SABRI_DELIVERY_MAX_TOKENS: int = 8000
    # Bounded retry if Sabri returns empty/malformed output (never spin, always deliver).
    SABRI_DELIVERY_MAX_ATTEMPTS: int = 2
    # There is deliberately NO turn-size target and NO message-length cap. Both existed
    # (SABRI_TURN_TARGET_MESSAGES = 8, SABRI_MAX_MESSAGE_WORDS = 26) and both decided, in code,
    # something only Sabri can judge: how much a person says in one breath. A conversation
    # cannot be run by a constant — sometimes she came to listen for fifteen minutes, sometimes
    # she wants one line and a question — so how many messages and how long each one is now
    # comes from him, every turn, informed by how long the client has been waiting.
    # ── Two-role proportional reveal pacing ──────────────────────────────────────
    # Sabri's messages reveal at real human typing speed: DUO_PER_WORD_MS per word, scaling
    # DIRECTLY + PROPORTIONALLY with each message's length, with NO upper cap. An eighty-word
    # paragraph genuinely takes eighty seconds to type, and that is what a person looks like;
    # the cap that used to hide this was the 26-word message chunker, now gone. A tiny floor
    # avoids a zero-length wait; a small gap sits between consecutive messages.
    # 1000ms/word = 60 words/min.
    DUO_PER_WORD_MS: int = 1000
    DUO_MIN_TYPING_MS: int = 300
    DUO_BETWEEN_BUBBLES_MS: int = 500
    # The immediate line the client reads within seconds of writing — greeting, first
    # reaction, goodbye. It ran on the cheap model, which produced canned-sounding warmth
    # and could not reliably do the intake half of the job (hear what she said, ask for the
    # one thing the reading is missing). It is the first thing a paying client reads, so it
    # runs on Sonnet. No thinking, no effort parameter: it must stay fast.
    FIRST_WORD_MODEL: str = "claude-sonnet-4-6"
    # ── The client clock (visual only — none of this gates when generation runs) ──
    # THE READ PAUSE. A real reader reads the message before she starts typing, and it takes
    # her longer when the client wrote more. Nothing at all is visible during this pause: no
    # dots, no line. Only after it does the reader react.
    READ_PAUSE_BASE_MS: int = 1500
    READ_PAUSE_PER_WORD_MS: int = 200
    READ_PAUSE_MAX_MS: int = 15000
    # THE SILENCE CEILING. Once the read pause is over, the client never sees more than this
    # much nothing. Sabri's immediate line normally lands first and the typing indicator comes
    # on behind it; if that line is slow or fails, the indicator comes on anyway at this mark
    # and stays on until real delivery begins.
    SILENCE_CEILING_MS: int = 5000
    # Backstop: if generation dies without ever delivering, the indicator cannot be left running
    # forever. Comfortably longer than the slowest observed generation (~66s).
    TYPING_PRESENCE_MAX_MS: int = 240000
    # Atlas (dossier auto-summary at session end) — Haiku-tier is plenty.
    ATLAS_SUMMARY_MODEL: str = "claude-haiku-4-5-20251001"
    ATLAS_SUMMARY_MAX_TOKENS: int = 512
    # ── Second Brain client-records vault (READ-ONLY) ────────────────────────────
    # Local folder of the CRM's client-records markdown files. Empty (the default,
    # and the state in the Docker container) disables the feature entirely: no
    # vault reads, drafting behaves exactly as before. Only files behind a
    # human-CONFIRMED client_record_mappings row are ever read (never written).
    # Host dev value: C:\Users\Haithem\Desktop\LAMMA\secondbrain\client-records
    CLIENT_RECORDS_VAULT_DIR: str = ""

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
