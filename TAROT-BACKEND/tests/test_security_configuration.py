"""Focused regression tests for required SMTP/JWT configuration."""

import ast
import secrets
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import AppSettings


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
REQUIRED_ENV_FIELDS = {
    "MAIL_SERVER",
    "MAIL_PORT",
    "MAIL_USERNAME",
    "MAIL_PASSWORD",
    "MAIL_FROM",
    "MAIL_STARTTLS",
    "MAIL_SSL_TLS",
    "JWT_SECRET_KEY",
}
REQUIRED_STRING_FIELDS = {
    "MAIL_SERVER",
    "MAIL_USERNAME",
    "MAIL_PASSWORD",
    "MAIL_FROM",
    "JWT_SECRET_KEY",
}


def _security_values() -> dict[str, object]:
    return {
        "MAIL_SERVER": "smtp.example.invalid",
        "MAIL_PORT": 465,
        "MAIL_USERNAME": "security-test@example.invalid",
        "MAIL_PASSWORD": secrets.token_urlsafe(32),
        "MAIL_FROM": "sender@example.invalid",
        "MAIL_STARTTLS": False,
        "MAIL_SSL_TLS": True,
        "MAIL_USE_CREDENTIALS": True,
        "MAIL_VALIDATE_CERTS": True,
        "MAIL_DEBUG": False,
        "JWT_SECRET_KEY": secrets.token_urlsafe(48),
    }


def test_committed_app_source_has_no_smtp_or_jwt_literals():
    """Credential/signing fields must come from settings, never string literals."""
    findings: list[tuple[str, int, str]] = []

    for path in (ROOT / "app").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                if node.target.id in REQUIRED_ENV_FIELDS and node.value is not None:
                    findings.append((str(path.relative_to(ROOT)), node.lineno, node.target.id))
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in REQUIRED_ENV_FIELDS:
                        findings.append((str(path.relative_to(ROOT)), node.lineno, target.id))
            if isinstance(node, ast.Call):
                for keyword in node.keywords:
                    if keyword.arg in REQUIRED_ENV_FIELDS and isinstance(
                        keyword.value, ast.Constant
                    ):
                        findings.append(
                            (str(path.relative_to(ROOT)), node.lineno, keyword.arg)
                        )

    assert findings == []


@pytest.mark.parametrize("missing", sorted(REQUIRED_ENV_FIELDS))
def test_production_settings_reject_missing_security_variable(monkeypatch, missing):
    values = _security_values()
    values.pop(missing)
    monkeypatch.delenv(missing, raising=False)

    with pytest.raises(ValidationError) as exc_info:
        AppSettings(_env_file=None, ENVIRONMENT="prod", **values)

    failed_fields = {str(error["loc"][0]) for error in exc_info.value.errors()}
    assert missing in failed_fields


@pytest.mark.parametrize("blank", sorted(REQUIRED_STRING_FIELDS))
def test_security_variables_reject_blank_values(blank):
    values = _security_values()
    values[blank] = "   "

    with pytest.raises(ValidationError) as exc_info:
        AppSettings(_env_file=None, ENVIRONMENT="prod", **values)

    failed_fields = {str(error["loc"][0]) for error in exc_info.value.errors()}
    assert blank in failed_fields


def test_security_settings_load_from_environment_without_source_defaults(monkeypatch):
    values = _security_values()
    for name, value in values.items():
        monkeypatch.setenv(name, str(value).lower() if isinstance(value, bool) else str(value))

    settings = AppSettings(_env_file=None, ENVIRONMENT="prod")

    assert settings.MAIL_USERNAME == values["MAIL_USERNAME"]
    assert settings.MAIL_PASSWORD == values["MAIL_PASSWORD"]
    assert settings.MAIL_FROM == values["MAIL_FROM"]
    assert settings.MAIL_SERVER == values["MAIL_SERVER"]
    assert settings.MAIL_PORT == values["MAIL_PORT"]
    assert settings.MAIL_STARTTLS is values["MAIL_STARTTLS"]
    assert settings.MAIL_SSL_TLS is values["MAIL_SSL_TLS"]
    assert settings.JWT_SECRET_KEY == values["JWT_SECRET_KEY"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"MAIL_STARTTLS": False, "MAIL_SSL_TLS": False},
        {"MAIL_STARTTLS": True, "MAIL_SSL_TLS": True},
        {"MAIL_USE_CREDENTIALS": False},
        {"MAIL_VALIDATE_CERTS": False},
        {"MAIL_DEBUG": True},
    ],
)
def test_production_rejects_insecure_mail_transport(overrides):
    values = _security_values()
    values.update(overrides)

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None, ENVIRONMENT="prod", **values)


def test_development_allows_explicit_mailpit_transport():
    values = _security_values()
    values.update(
        {
            "MAIL_SERVER": "mailpit",
            "MAIL_PORT": 1025,
            "MAIL_STARTTLS": False,
            "MAIL_SSL_TLS": False,
            "MAIL_USE_CREDENTIALS": False,
            "MAIL_VALIDATE_CERTS": False,
            "MAIL_DEBUG": True,
        }
    )

    settings = AppSettings(_env_file=None, ENVIRONMENT="dev", **values)

    assert settings.MAIL_SERVER == "mailpit"
    assert settings.MAIL_PORT == 1025
    assert settings.MAIL_STARTTLS is False
    assert settings.MAIL_SSL_TLS is False


@pytest.mark.parametrize("port", [0, 65536])
def test_mail_port_must_be_in_valid_range(port):
    values = _security_values()
    values["MAIL_PORT"] = port

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None, ENVIRONMENT="prod", **values)


def test_email_connection_uses_central_settings_for_credentials():
    path = ROOT / "app" / "services" / "email.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    connection = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "ConnectionConfig"
    )
    keywords = {keyword.arg: keyword.value for keyword in connection.keywords}

    expected_settings = {
        "MAIL_USERNAME": "MAIL_USERNAME",
        "MAIL_PASSWORD": "MAIL_PASSWORD",
        "MAIL_FROM": "MAIL_FROM",
        "MAIL_SERVER": "MAIL_SERVER",
        "MAIL_PORT": "MAIL_PORT",
        "MAIL_STARTTLS": "MAIL_STARTTLS",
        "MAIL_SSL_TLS": "MAIL_SSL_TLS",
        "USE_CREDENTIALS": "MAIL_USE_CREDENTIALS",
        "VALIDATE_CERTS": "MAIL_VALIDATE_CERTS",
        "MAIL_DEBUG": "MAIL_DEBUG",
    }
    for connection_name, setting_name in expected_settings.items():
        value = keywords[connection_name]
        assert isinstance(value, ast.Attribute)
        assert isinstance(value.value, ast.Name)
        assert value.value.id == "settings"
        assert value.attr == setting_name


def _backend_environment(path: Path) -> dict[str, str]:
    """Parse the small Compose backend environment block without loading env files."""
    lines = path.read_text(encoding="utf-8").splitlines()
    in_backend = False
    in_environment = False
    result: dict[str, str] = {}

    for line in lines:
        if line == "  backend:":
            in_backend = True
            continue
        if in_backend and line.startswith("  ") and not line.startswith("    "):
            break
        if in_backend and line == "    environment:":
            in_environment = True
            continue
        if not in_environment or not line.strip() or line.lstrip().startswith("#"):
            continue
        if len(line) - len(line.lstrip()) <= 4:
            break

        item = line.strip()
        if item.startswith("- "):
            item = item[2:]
        if "=" in item:
            name, value = item.split("=", 1)
        else:
            name, value = item.split(":", 1)
        result[name.strip()] = value.strip()

    return result


def test_development_compose_routes_mail_only_to_mailpit():
    environment = _backend_environment(PROJECT_ROOT / "docker-compose.yml")

    assert environment["MAIL_SERVER"] == "mailpit"
    assert environment["MAIL_PORT"] == "1025"
    assert environment["MAIL_STARTTLS"] == "false"
    assert environment["MAIL_SSL_TLS"] == "false"
    assert environment["MAIL_USE_CREDENTIALS"] == "false"
    assert environment["MAIL_VALIDATE_CERTS"] == "false"


def test_production_compose_requires_non_mailpit_environment_configuration():
    path = PROJECT_ROOT / "docker-compose.prod.yml"
    environment = _backend_environment(path)
    required = {
        "MAIL_SERVER",
        "MAIL_PORT",
        "MAIL_USERNAME",
        "MAIL_PASSWORD",
        "MAIL_FROM",
        "MAIL_STARTTLS",
        "MAIL_SSL_TLS",
        "MAIL_USE_CREDENTIALS",
        "MAIL_VALIDATE_CERTS",
        "JWT_SECRET_KEY",
    }

    for name in required:
        assert environment[name].startswith(f"${{{name}:?")
    assert environment["MAIL_SERVER"] != "mailpit"


def test_atlas_compose_loads_the_ignored_crm_provider_environment():
    lines = (PROJECT_ROOT / "docker-compose.atlas.yml").read_text(encoding="utf-8").splitlines()
    atlas_start = lines.index("  atlas:")
    atlas_lines = lines[atlas_start + 1:]
    atlas_end = next(
        (index for index, line in enumerate(atlas_lines) if line.startswith("  ") and not line.startswith("    ")),
        len(atlas_lines),
    )
    atlas_block = atlas_lines[:atlas_end]

    assert "      - ./.env.atlas" in atlas_block
    assert "      - ./.env.crm-providers.local" in atlas_block
    assert ".env.*.local" in (PROJECT_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()


@pytest.mark.parametrize(
    "relative_path",
    [
        ".github/workflows/deploy.yml",
        "deploy.sh",
        "README.prod.md",
    ],
)
def test_production_compose_commands_supply_backend_env_file(relative_path):
    lines = (PROJECT_ROOT / relative_path).read_text(encoding="utf-8").splitlines()
    commands = [
        line
        for line in lines
        if "docker compose" in line and "docker-compose.prod.yml" in line
    ]

    assert commands
    assert all("--env-file TAROT-BACKEND/.env" in line for line in commands)
