"""The server's sign-in answers every role as before (ROUND31, B1 = A).

The website refuses a reader (PSYCHIC) or an admin (ADMIN) on its own sign-in
page with "This account can't sign in here." (tarot-landing-web
src/features/auth/websiteSignIn.ts, tested by
scripts/test-website-sign-in.mts). The rule lives there, not here: the CRM
signs in through this same POST /api/auth/sign-in (crm/src/client/request.ts
websiteLogin, and the Vulcan gateway's stored login), so the server must keep
issuing tokens to every role, the superadmin's included.
"""

import pytest

from app.enums.role import Role
from app.models import User
from app.utils.security import decode_token
from tests.test_auth_logs import EMAIL, PASSWORD, _body, auth, mail  # noqa: F401


@pytest.mark.parametrize("role", [Role.SUPERADMIN, Role.ADMIN, Role.PSYCHIC, Role.USER])
def test_the_server_signs_in_every_role(db, auth, role):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    user.role = role
    user.is_verified = True
    db.commit()

    response = auth.post("/api/auth/sign-in", json={"email": EMAIL, "password": PASSWORD})

    assert response.status_code == 200, response.text
    assert decode_token(response.json()["access_token"])["role"] == role.value


@pytest.mark.parametrize("role", [Role.SUPERADMIN, Role.ADMIN, Role.PSYCHIC, Role.USER])
def test_the_server_refreshes_every_roles_session(db, auth, role):
    """ROUND32, decision 6: the website now also ends a reader's or admin's
    stored session when it opens (websiteSignIn.ts endRefusedStoredSession).
    The server still refreshes every role's token, as the CRM's Vulcan gateway
    does with its stored login (crm/src/server/gateway/vulcan.ts tryRefresh)."""
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    user.role = role
    user.is_verified = True
    db.commit()
    signed_in = auth.post("/api/auth/sign-in", json={"email": EMAIL, "password": PASSWORD}).json()

    response = auth.post("/api/auth/refresh-token", json={"refresh_token": signed_in["refresh_token"]})

    assert response.status_code == 200, response.text
    assert decode_token(response.json()["access_token"])["role"] == role.value
