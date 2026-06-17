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
    JWT_TOKEN_EXPIRE_MINUTES: int = 9999

    APP_BASE_URL: str = "https://askvalentina.co.uk/api/"
    FRONT_BASE_URL: str = "https://askvalentina.co.uk/"

    MEDIA_DIR: Path = Path("media/uploads")

    SOCKET_AUTH_TIMEOUT: int = 60

    STRIPE_ENDPOINT_SECRET: str = ""
    STRIPE_API_KEY: str = ""

    BILLING_TASK_MAX_RETRIES: int = 3
    BILLING_TASK_RETRY_DELAY_SECONDS: int = 5

    # Session Manager Settings
    SESSION_MINIMUM_BALANCE_SECONDS: int = 60  # Require 60 seconds worth of balance
    SESSION_CLIENT_DISCONNECT_TIMEOUT: int = 30  # Wait 30s for client reconnect
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
