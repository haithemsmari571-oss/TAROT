"""One-time admin utility: set the SUPERADMIN password.

The operator types the new password with HIDDEN input. The password is never
printed, never logged, and never passed as a command-line argument. Only an
existing SUPERADMIN account is reset (this script never creates one).

Run it inside the backend container (from /root/TAROT on the server):

    docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
        python scripts/set_superadmin_password.py
"""

import getpass
import sys

from app.database.client import SessionLocal
from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.models.user import User
from app.utils.security import hash_password

TARGET_EMAIL = "superadmin@tarot.com"
MIN_LENGTH = 8


def main() -> int:
    db = SessionLocal()
    try:
        user = (
            db.query(User).filter(User.email.ilike(TARGET_EMAIL)).first()
        )
        if user is None:
            print(f"No account with email {TARGET_EMAIL} was found — aborting.")
            print("This script only RESETS an existing superadmin; it does not create one.")
            return 1
        if user.role != Role.SUPERADMIN:
            print(f"Account {TARGET_EMAIL} is not a SUPERADMIN (role={user.role.value}) — aborting for safety.")
            return 1

        print(f"Setting a new password for {TARGET_EMAIL} (input is hidden).")
        first = getpass.getpass("New password: ")
        second = getpass.getpass("Confirm new password: ")

        if first != second:
            print("The two entries did not match. Nothing was changed.")
            return 1
        if len(first) < MIN_LENGTH:
            print(f"Password must be at least {MIN_LENGTH} characters. Nothing was changed.")
            return 1

        user.password_hash = hash_password(first)
        user.is_verified = True
        user.status = UserStatus.ACTIVE
        db.commit()

        print(f"Done. The password for {TARGET_EMAIL} has been updated. You can sign in now.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
