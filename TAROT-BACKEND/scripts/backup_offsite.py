"""Database backups off the server (ROUND60): the R2 half of scripts/backup/backup_db.sh.

The nightly backup (scripts/backup/backup_db.sh at the top of the repository)
dumps the database on the server, then hands the file to this module inside the
backend container, which already has boto3 and the R2 keys the media uploads
use (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). The backups go into
a bucket of their own, never the media bucket (R2_BUCKET), which the site serves
to the public: a bucket with public access off has no public address at all.

    python -m scripts.backup_offsite upload --bucket askvalentina-backups --name tarot-backup-2026-10-07-0315.sql.gz < file
        stores the file read from stdin as db/<name>, checks the stored size,
        then deletes every backup in db/ older than KEEP_DAYS days (never the newest)
    python -m scripts.backup_offsite list --bucket askvalentina-backups
    python -m scripts.backup_offsite download --bucket askvalentina-backups --name <name> > file

No key or secret is ever printed. Any failure prints one FAILED line and exits 1.
"""

import argparse
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_app_settings

PREFIX = "db/"
KEEP_DAYS = 30
# What backup_db.sh names its files: tarot-backup-<UK date>-<UK hour and minute>.sql.gz
NAME = re.compile(r"^tarot-backup-\d{4}-\d{2}-\d{2}-\d{4}\.sql\.gz$")
GZIP_MAGIC = b"\x1f\x8b"
CHUNK_BYTES = 8 * 1024 * 1024


class Failure(Exception):
    """One plain line saying what went wrong."""


def storage(bucket: str):
    """An S3 client on the R2 account the media uploads use, set as
    services/object_storage.py sets its own, but patient: a nightly job may wait
    and retry where an admin form must answer at once."""
    settings = get_app_settings()
    missing = [name for name in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
               if not getattr(settings, name).strip()]
    if missing:
        raise Failure("R2 is not configured in the backend: missing " + ", ".join(missing) + ".")
    if not bucket.strip():
        raise Failure("no bucket given.")
    if bucket == settings.R2_BUCKET:
        raise Failure(f"{bucket} is the media bucket, which the site serves to the public. Backups go only into a private bucket.")
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT.rstrip("/"),
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            connect_timeout=10,
            retries={"total_max_attempts": 5, "mode": "standard"},
            s3={"addressing_style": "path"},
        ),
    )


def backups(client, bucket: str) -> list[dict]:
    """Every backup in the bucket, oldest first."""
    found = []
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=PREFIX):
        found.extend(page.get("Contents", []))
    return sorted(found, key=lambda item: item["LastModified"])


def check_name(name: str) -> str:
    if not NAME.match(name):
        raise Failure(f"{name!r} is not a backup file name (tarot-backup-YYYY-MM-DD-HHMM.sql.gz).")
    return PREFIX + name


def upload(client, bucket: str, name: str, keep_days: int) -> None:
    key = check_name(name)
    with tempfile.TemporaryFile() as spool:
        size = 0
        while chunk := sys.stdin.buffer.read(CHUNK_BYTES):
            if size == 0 and not chunk.startswith(GZIP_MAGIC):
                raise Failure("what was handed over is not a gzip file.")
            spool.write(chunk)
            size += len(chunk)
        if size == 0:
            raise Failure("nothing was handed over (0 bytes).")
        spool.seek(0)
        client.upload_fileobj(spool, bucket, key, ExtraArgs={"ContentType": "application/gzip"})
    stored = client.head_object(Bucket=bucket, Key=key)["ContentLength"]
    if stored != size:
        raise Failure(f"{key} is stored with {stored} bytes, but {size} were sent.")
    print(f"Uploaded {bucket}/{key} ({size:,} bytes, size checked).")
    prune(client, bucket, keep_days)


def prune(client, bucket: str, keep_days: int) -> None:
    """Deletes the backups older than keep_days days; the newest always stays."""
    found = backups(client, bucket)
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    old = [item for item in found[:-1] if item["LastModified"] < cutoff]
    for item in old:
        client.delete_object(Bucket=bucket, Key=item["Key"])
        print(f"Deleted {item['Key']} (stored {item['LastModified']:%Y-%m-%d %H:%M} UTC, older than {keep_days} days).")
    kept = len(found) - len(old)
    print(f"Backups in {bucket}: {kept}, newest {found[-1]['Key']}." if found else f"Backups in {bucket}: 0.")


def list_backups(client, bucket: str) -> None:
    found = backups(client, bucket)
    for item in found:
        print(f"{item['Key']}  {item['Size']:>12,} bytes  {item['LastModified']:%Y-%m-%d %H:%M} UTC")
    print(f"{len(found)} backup(s) in {bucket}.")


def download(client, bucket: str, name: str) -> None:
    key = check_name(name)
    try:
        body = client.get_object(Bucket=bucket, Key=key)["Body"]
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            raise Failure(f"there is no backup {key} in {bucket}.") from error
        raise
    for chunk in body.iter_chunks(CHUNK_BYTES):
        sys.stdout.buffer.write(chunk)
    sys.stdout.buffer.flush()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m scripts.backup_offsite", description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    up = commands.add_parser("upload", help="store the gzip file read from stdin, then delete old backups")
    up.add_argument("--bucket", required=True)
    up.add_argument("--name", required=True)
    up.add_argument("--keep-days", type=int, default=KEEP_DAYS, help=f"default {KEEP_DAYS}")
    ls = commands.add_parser("list", help="every backup in the bucket")
    ls.add_argument("--bucket", required=True)
    down = commands.add_parser("download", help="write one backup to stdout")
    down.add_argument("--bucket", required=True)
    down.add_argument("--name", required=True)
    args = parser.parse_args(argv)

    try:
        client = storage(args.bucket)
        if args.command == "upload":
            upload(client, args.bucket, args.name, args.keep_days)
        elif args.command == "list":
            list_backups(client, args.bucket)
        else:
            download(client, args.bucket, args.name)
        return 0
    except Failure as failure:
        print(f"FAILED: {failure}", file=sys.stderr)
    except ClientError as error:
        detail = error.response.get("Error", {})
        print(f"FAILED: R2 answered {detail.get('Code', 'an error')}: {detail.get('Message', '')}".rstrip(": "), file=sys.stderr)
    except BotoCoreError as error:
        print(f"FAILED: R2 could not be reached ({type(error).__name__}).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
