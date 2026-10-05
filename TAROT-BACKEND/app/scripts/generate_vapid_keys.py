"""Make the server's phone notification keys, once (ROUND57).

Prints the three lines TAROT-BACKEND/.env needs, ready to append:

    docker exec tarot-backend python -m app.scripts.generate_vapid_keys >> TAROT-BACKEND/.env

Run it once. New keys later would silently stop every phone that already
turned notifications on, until each opens the app again.
"""

from app.services.web_push import generate_vapid_keys

# Who the push services may write to about this server's notifications.
VAPID_SUBJECT = "mailto:support@askvalentina.co.uk"


def main() -> None:
    public, private = generate_vapid_keys()
    print(f"VAPID_PUBLIC_KEY={public}")
    print(f"VAPID_PRIVATE_KEY={private}")
    print(f"VAPID_SUBJECT={VAPID_SUBJECT}")


if __name__ == "__main__":
    main()
