"""Close a staff account (ROUND60), the way a client's own Delete account closes hers.

Run it on the server from /root/TAROT, the folder that holds docker-compose.yml.
The image keeps this file at /app/scripts/close_account.py and the backend
container starts in /app, so the module is scripts.close_account:

    docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml \
        exec -T backend python -m scripts.close_account --id 42

Without --apply it is a dry run: it prints the account and what would change,
and changes nothing (its transaction is read only). With --apply, in ONE
transaction, its emailed links (verify account, reset password) are deleted, so
no link in an old email can set a password, and the account is then closed by
services/users.py soft_delete_own_account, the function a client's own Delete
account calls:
- its email becomes deleted-<id>@deleted.askvalentina.co.uk and its name
  deleted-user-<id>; date of birth, gender, bio and photo are cleared;
- its password becomes a random one nobody knows;
- its status becomes SUSPENDED, which every signed-in route and both sockets
  refuse, so every sign-in it already has stops working at once;
- its push subscriptions and phone push tokens are deleted.
Chats, payments and every other row stay, under the closed identity.

It refuses, and changes nothing, for: account 1; the last SUPERADMIN who can
still sign in; any reader (PSYCHIC); a client (USER), who closes her own
account in the app; an id with no account. A second run finds nothing to do.
"""

import argparse
import sys

from sqlalchemy import delete, func, select, text

import app.models  # noqa: F401  (registers every model)
from app.database.client import SessionLocal, engine
from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.logging_config import mask_email
from app.models.auth_link_token import AuthLinkToken
from app.models.chat import Chat
from app.models.push_subscription import PushSubscription
from app.models.push_token import PushToken
from app.models.user import User
from app.services.users import closed_account_email, soft_delete_own_account

# The site's first owner account: never closed here, whatever its role.
PROTECTED_ID = 1
STAFF = (Role.SUPERADMIN, Role.ADMIN)
APPLY_HINT = "Nothing has been changed. To do it, run the same command again with --apply at the end."


class Refusal(Exception):
    """The account must not be closed; nothing was changed."""


def _rows(db, model, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id))


def _other_superadmins(db, user_id: int) -> int:
    """SUPERADMIN accounts other than this one that can still sign in."""
    return db.scalar(
        select(func.count()).select_from(User).where(
            User.role == Role.SUPERADMIN,
            User.status == UserStatus.ACTIVE,
            User.is_verified.is_(True),
            User.id != user_id,
        )
    )


def check(db, account_id: int, user: User | None) -> None:
    if account_id == PROTECTED_ID:
        raise Refusal("account 1 is the site's first owner account. This script never closes it.")
    if user is None:
        raise Refusal(f"there is no account with id {account_id}.")
    if user.role == Role.PSYCHIC:
        raise Refusal(f"account {account_id} is a reader. A reader is hidden in AV Admin, never closed here.")
    if user.role not in STAFF:
        raise Refusal(f"account {account_id} is a client. A client closes her own account in the app (You, Delete account).")
    if user.role == Role.SUPERADMIN and _other_superadmins(db, user.id) == 0:
        raise Refusal(f"account {account_id} is the last SUPERADMIN who can sign in. Closing it would lock everyone out of AV Admin.")


def describe(db, user: User) -> dict:
    return {
        "push subscriptions": _rows(db, PushSubscription, user.id),
        "phone push tokens": _rows(db, PushToken, user.id),
        "emailed links": _rows(db, AuthLinkToken, user.id),
        "chats as a client": db.scalar(select(func.count()).select_from(Chat).where(Chat.user_id == user.id)),
    }


def print_account(db, user: User, heading: str) -> None:
    print(heading)
    print(f"  role                {user.role.value}")
    print(f"  status              {user.status.value}")
    print(f"  name                {user.username}")
    print(f"  email               {mask_email(user.email)}")
    print(f"  created             {user.created_at:%Y-%m-%d %H:%M}")
    for label, count in describe(db, user).items():
        print(f"  {label:<19} {count}")


def print_plan(db, user: User) -> None:
    counts = describe(db, user)
    print("\nIt would:")
    print(f"  - replace the email with {closed_account_email(user.id)} and the name with deleted-user-{user.id}")
    print("  - clear the date of birth, gender, bio and photo")
    print("  - set a random password nobody knows")
    print("  - set the status to SUSPENDED: every sign-in it already has stops working at once")
    print(f"  - delete {counts['push subscriptions']} push subscription(s), {counts['phone push tokens']} phone push token(s)"
          f" and {counts['emailed links']} emailed link(s)")
    print("  Chats, payments and every other row stay, under the closed identity.")


def close(db, user: User) -> None:
    """One transaction: soft_delete_own_account commits the link deletion with its own changes."""
    db.execute(delete(AuthLinkToken).where(AuthLinkToken.user_id == user.id))
    soft_delete_own_account(db, user)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.close_account",
        description="Close a staff account (no sign-in, email and name gone). A dry run unless --apply is given.",
    )
    parser.add_argument("--id", required=True, type=int, dest="account_id", help="the account to close")
    parser.add_argument("--apply", action="store_true", help="make the change; without it nothing is changed")
    args = parser.parse_args(argv)

    print(f"Database: {engine.url.database} on {engine.url.host}")
    db = SessionLocal()
    try:
        query = select(User).where(User.id == args.account_id)
        if args.apply:
            # Every SUPERADMIN row and this one, held until the commit, so two
            # runs at once cannot close the last two SUPERADMINs between them.
            db.execute(select(User.id).where(User.role == Role.SUPERADMIN).with_for_update())
            query = query.with_for_update()
        else:
            db.execute(text("SET TRANSACTION READ ONLY"))
        user = db.scalars(query).first()
        check(db, args.account_id, user)
        print_account(db, user, f"\nAccount {user.id}")
        if user.status == UserStatus.SUSPENDED and user.email == closed_account_email(user.id):
            print("\nAlready closed. Nothing to do.")
            return 0
        print_plan(db, user)
        if not args.apply:
            print(f"\n{APPLY_HINT}")
            return 0
        close(db, user)
        db.refresh(user)
        print_account(db, user, f"\nAccount {user.id} now")
        print("\nDone. The account is closed and the change is committed.")
        return 0
    except Refusal as refusal:
        print(f"\nREFUSED: {refusal} Nothing was changed.")
        return 1
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    sys.exit(main())
