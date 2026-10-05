"""Launch cleanup (ROUND58): delete the test clients and hide the test readers.

Run it on the server from /root/TAROT, the folder that holds docker-compose.yml.
The image keeps this file at /app/scripts/launch_cleanup.py and the backend
container starts in /app, so the module is scripts.launch_cleanup:

    docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml \
        exec backend python -m scripts.launch_cleanup \
        --keep-readers-created-after 2026-10-05T19:00:00Z

Without --apply it is a dry run: it changes nothing (its transaction is read
only) and prints what it would do. With --apply, in ONE transaction:
- every client account (role USER) is deleted, except those named with
  --keep-client, together with every row that belongs to it;
- every reader created before the cutoff is hidden (is_listed false, the flag
  AV Admin's Hidden switch sets) and its chats are deleted with everything in them;
- every SUPERADMIN and ADMIN account, every reader created at or after the
  cutoff and every media file is left alone.

"Every row that belongs to it" is found from the foreign keys, the models' and
the live database's together, never from a list written here: a row whose NOT
NULL foreign key names a deleted row is deleted too, all the way down; a
nullable foreign key that names a deleted row is set to NULL and its row kept.
A column that holds a user id without a foreign key is followed the same way.

It refuses, and changes nothing, when an owner or admin account would be
touched, when --keep-client names anything but a client, or when the models
name a column this database does not have (deploy first). A second run finds
nothing to do.
"""

import argparse
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from graphlib import CycleError, TopologicalSorter
from typing import NamedTuple

from sqlalchemy import Integer, MetaData, and_, delete, func, not_, or_, select, text, update

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.database.client import engine
from app.enums.role import Role
from app.enums.transaction_type import TransactionType
from app.logging_config import mask_email
from app.models.base import Base
from app.services.reply_emails import pounds

USERS = "users"
CHATS = "chats"
MESSAGES = "messages"
TRANSACTIONS = "transactions"
CLIENT = Role.USER.value
READER = Role.PSYCHIC.value
OWNERS = [Role.SUPERADMIN.value, Role.ADMIN.value]
# A column that holds a user's id, by its name: followed even without a foreign key.
USER_ID_COLUMN = re.compile(r"(^|_)(user|client|psychic)_id$")
# Every owner and admin row, whole: the same before and after, or the run is rolled back.
OWNERS_FINGERPRINT = text(
    "SELECT md5(coalesce(string_agg(u::text, '|' ORDER BY id), '')) FROM users u "
    "WHERE role::text = ANY(:roles)"
)
CUTOFF_EXAMPLE = "2026-10-05T19:00:00Z"
APPLY_HINT = "Nothing has been changed. To do it, run the same command again with --apply at the end."


class Refusal(Exception):
    """Stops the run before anything is written, or rolls the transaction back."""


class Link(NamedTuple):
    """child.column holds the id of a parent row."""

    child: str
    column: str
    parent: str
    nullable: bool
    foreign_key: bool


class Plan(NamedTuple):
    cutoff: datetime
    clients: list  # client rows to delete
    kept_clients: list
    owners: list
    test_readers: list  # readers created before the cutoff
    kept_readers: list
    to_hide: list  # test readers still listed
    deleted: dict  # table -> ids of its rows to delete, for every table something points at
    doomed: dict  # table -> where clause of its rows to delete
    counts: dict  # table -> rows to delete
    cleared: list  # (link, where clause, rows): kept rows whose link is set to NULL
    order: list  # the tables to delete from, children before parents
    chats_of: dict  # client id -> chats
    card_of: dict  # client id -> pounds paid by card


def parse_cutoff(value: str) -> datetime:
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise argparse.ArgumentTypeError(f"{value!r} is not a date and time, for example {CUTOFF_EXAMPLE}")
    if moment.tzinfo is None:
        raise argparse.ArgumentTypeError(f"give the time in UTC with a Z at the end, for example {CUTOFF_EXAMPLE}")
    return moment.astimezone(timezone.utc)


def find_links(db: MetaData) -> list[Link]:
    """Every foreign key in the models and in the live database, and every
    user id column with none. A column the models know and the database lacks
    stops the run: the database is behind the code."""
    sources: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for source, meta in (("models", Base.metadata), ("database", db)):
        for table in meta.tables.values():
            for fk in table.foreign_keys:
                if fk.column.name != "id":
                    raise Refusal(f"{table.name}.{fk.parent.name} points at {fk.column.table.name}.{fk.column.name}, not at an id. Nothing was changed.")
                sources[(table.name, fk.parent.name, fk.column.table.name)].add(source)
    links = []
    for child, column, parent in sorted(sources):
        table = db.tables.get(child)
        if table is None or column not in table.c:
            raise Refusal(f"The models have {child}.{column} but this database does not. Deploy the new code first. Nothing was changed.")
        links.append(Link(child, column, parent, table.c[column].nullable, True))
    linked = {(link.child, link.column) for link in links}
    for table in db.tables.values():
        for column in table.columns:
            if (
                USER_ID_COLUMN.search(column.name)
                and isinstance(column.type, Integer)
                and not column.primary_key
                and (table.name, column.name) not in linked
            ):
                links.append(Link(table.name, column.name, USERS, column.nullable, False))
    return links


def _role(value) -> str:
    return value.value if isinstance(value, Role) else str(value)


def build_plan(conn, db: MetaData, links: list[Link], cutoff: datetime, keep: list[int]) -> Plan:
    users, chats, transactions = db.tables[USERS], db.tables[CHATS], db.tables[TRANSACTIONS]
    rows = conn.execute(select(users).order_by(users.c.id)).mappings().all()
    role = {row["id"]: _role(row["role"]) for row in rows}
    for user_id in keep:
        if role.get(user_id) != CLIENT:
            raise Refusal(f"--keep-client {user_id}: there is no client account with that id. Nothing was changed.")
    clients = [row for row in rows if role[row["id"]] == CLIENT and row["id"] not in keep]
    kept_clients = [row for row in rows if row["id"] in keep]
    owners = [row for row in rows if role[row["id"]] in OWNERS]
    readers = [row for row in rows if role[row["id"]] == READER]
    test_readers = [row for row in readers if row["created_at"] < cutoff]
    kept_readers = [row for row in readers if row["created_at"] >= cutoff]
    to_hide = [row for row in test_readers if row["is_listed"]]

    deleted: dict[str, set[int]] = defaultdict(set)
    deleted[USERS] = {row["id"] for row in clients}
    test_reader_ids = [row["id"] for row in test_readers]
    if test_reader_ids:
        deleted[CHATS] |= set(conn.scalars(select(chats.c.id).where(chats.c.psychic_id.in_(test_reader_ids))))

    holding = [link for link in links if not link.nullable]
    parents = {link.parent for link in links}

    def where_doomed(name: str):
        table = db.tables[name]
        clauses = [
            table.c[link.column].in_(sorted(deleted[link.parent]))
            for link in holding
            if link.child == name and deleted[link.parent]
        ]
        if name in parents and deleted[name]:
            clauses.append(table.c.id.in_(sorted(deleted[name])))
        return or_(*clauses) if clauses else None

    # Follow the NOT NULL links down until nothing new is reached.
    grown = True
    while grown:
        grown = False
        for name in sorted(parents):
            clause = where_doomed(name)
            if clause is None:
                continue
            ids = set(conn.scalars(select(db.tables[name].c.id).where(clause))) - deleted[name]
            if ids:
                deleted[name] |= ids
                grown = True

    if deleted[USERS] != {row["id"] for row in clients}:
        raise Refusal("The links reach accounts that are not test clients. Owner, admin and reader accounts are never deleted. Nothing was changed.")

    doomed, counts = {}, {}
    for name in sorted(db.tables):
        clause = where_doomed(name)
        if clause is None:
            continue
        count = conn.scalar(select(func.count()).select_from(db.tables[name]).where(clause))
        if count:
            doomed[name], counts[name] = clause, count

    cleared = []
    for link in links:
        if not link.nullable or not deleted[link.parent]:
            continue
        if link.child == USERS:
            raise Refusal(f"users.{link.column} names a deleted row; accounts that are kept are never changed. Nothing was changed.")
        table = db.tables[link.child]
        clause = table.c[link.column].in_(sorted(deleted[link.parent]))
        if link.child in doomed:
            clause = and_(clause, not_(doomed[link.child]))
        count = conn.scalar(select(func.count()).select_from(table).where(clause))
        if count:
            cleared.append((link, clause, count))

    graph = TopologicalSorter()
    for name in doomed:
        graph.add(name)
    for link in links:
        if link.child in doomed and link.parent in doomed and link.child != link.parent:
            graph.add(link.parent, link.child)  # the child's rows go first
    try:
        order = list(graph.static_order())
    except CycleError as error:
        raise Refusal(f"The tables point at each other in a circle ({error.args[1]}). Nothing was changed.")

    listed = [row["id"] for row in clients + kept_clients]
    chats_of, card_of = defaultdict(int), defaultdict(float)
    if listed:
        per_client = select(chats.c.user_id, func.count()).where(chats.c.user_id.in_(listed)).group_by(chats.c.user_id)
        chats_of.update(dict(conn.execute(per_client).all()))
        by_card = and_(
            transactions.c.user_id.in_(listed),
            transactions.c.transaction_type == TransactionType.CREDIT.value,
            transactions.c.stripe_payment_intent_id.is_not(None),
        )
        paid = select(transactions.c.user_id, func.sum(transactions.c.amount)).where(by_card).group_by(transactions.c.user_id)
        card_of.update({user_id: float(total or 0) for user_id, total in conn.execute(paid)})

    return Plan(cutoff, clients, kept_clients, owners, test_readers, kept_readers, to_hide,
                deleted, doomed, counts, cleared, order, chats_of, card_of)


def _day(moment) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%d")


def _client_line(plan: Plan, row) -> str:
    balance = float(row["balance"] or 0) + float(row["credit_balance"] or 0)
    return (
        f"  #{row['id']:<6} {row['username'][:28]:<28} {mask_email(row['email'])[:34]:<34} "
        f"created {_day(row['created_at'])}  chats {plan.chats_of[row['id']]:<3} "
        f"balance {pounds(balance):<10} paid by card {pounds(plan.card_of[row['id']])}"
    )


def _reader_line(row, note: str = "") -> str:
    return f"  #{row['id']:<6} {row['username'][:40]:<40} created {_day(row['created_at'])}{note}"


def print_plan(plan: Plan, links: list[Link], database: str, applying: bool) -> None:
    print("Ask Valentina launch cleanup")
    print(f"Database: {database}")
    print("APPLY: the changes below are made now, in one transaction." if applying else "DRY RUN: nothing is changed.")
    print(f"Readers created before {plan.cutoff:%Y-%m-%d %H:%M:%S} UTC are test readers.")
    unlinked = [f"{link.child}.{link.column}" for link in links if not link.foreign_key]
    print(f"Links followed: {sum(link.foreign_key for link in links)} foreign keys from the models and the database"
          + (f", and user id columns without one: {', '.join(unlinked)}" if unlinked else "") + ".")

    print(f"\nCLIENT ACCOUNTS TO DELETE ({len(plan.clients)})")
    for row in plan.clients:
        print(_client_line(plan, row))
    if not plan.clients:
        print("  none")

    print(f"\nREADERS TO HIDE ({len(plan.to_hide)})")
    for row in plan.to_hide:
        print(_reader_line(row))
    if not plan.to_hide:
        print("  none")
    already = [row for row in plan.test_readers if not row["is_listed"]]
    if already:
        print(f"  Test readers already hidden, left hidden; any chat they still have is deleted ({len(already)}):")
        for row in already:
            print(_reader_line(row, "  (already hidden)"))

    print(f"\nCHATS TO DELETE: {len(plan.deleted.get(CHATS, ()))}, with {plan.counts.get(MESSAGES, 0)} messages "
          "(every chat of a deleted client and every chat of a test reader)")

    print("\nACCOUNTS KEPT")
    print(f"  Owner and admin accounts ({len(plan.owners)}):")
    for row in plan.owners:
        print(f"  #{row['id']:<6} {row['username'][:40]:<40} {_role(row['role'])}")
    print(f"  Readers created at or after the cutoff ({len(plan.kept_readers)}):")
    for row in plan.kept_readers:
        print(_reader_line(row, "" if row["is_listed"] else "  (hidden by the owner, stays hidden)"))
    if not plan.kept_readers:
        print("  none")
    if plan.kept_clients:
        print(f"  Clients kept with --keep-client ({len(plan.kept_clients)}):")
        for row in plan.kept_clients:
            print(_client_line(plan, row))

    print("\nROWS, TABLE BY TABLE")
    for name in sorted(plan.counts):
        print(f"  {name:<32} delete {plan.counts[name]}")
    for link, _, count in plan.cleared:
        print(f"  {link.child:<32} keep {count}, clear {link.column} (it named a deleted {link.parent} row)")
    if plan.to_hide:
        print(f"  {USERS:<32} hide {len(plan.to_hide)} readers (is_listed false)")
    if nothing_to_do(plan):
        print("  none")
    print("\nMedia files (photos, audio, video) are left alone.")


def nothing_to_do(plan: Plan) -> bool:
    return not plan.counts and not plan.cleared and not plan.to_hide


def table_counts(conn, db: MetaData, names) -> dict:
    return {name: conn.scalar(select(func.count()).select_from(db.tables[name])) for name in names}


def users_by_role(conn, db: MetaData) -> dict:
    users = db.tables[USERS]
    out = defaultdict(int)
    for user_role, is_listed, n in conn.execute(select(users.c.role, users.c.is_listed, func.count()).group_by(users.c.role, users.c.is_listed)):
        out[_role(user_role)] += n
        if _role(user_role) == READER:
            out[f"{READER} listed" if is_listed else f"{READER} hidden"] += n
    return out


def apply_plan(conn, db: MetaData, plan: Plan) -> None:
    users = db.tables[USERS]
    touched = sorted(set(plan.counts) | {link.child for link, _, _ in plan.cleared} | {USERS})
    before, roles_before = table_counts(conn, db, touched), users_by_role(conn, db)
    owners_before = conn.scalar(OWNERS_FINGERPRINT, {"roles": OWNERS})

    for link, clause, count in plan.cleared:
        done = conn.execute(update(db.tables[link.child]).where(clause).values({link.column: None})).rowcount
        if done != count:
            raise Refusal(f"{link.child}.{link.column}: {done} rows cleared, {count} planned. Rolled back, nothing was changed.")
    for name in plan.order:
        done = conn.execute(delete(db.tables[name]).where(plan.doomed[name])).rowcount
        if done != plan.counts[name]:
            raise Refusal(f"{name}: {done} rows deleted, {plan.counts[name]} planned. Rolled back, nothing was changed.")
    hide_ids = [row["id"] for row in plan.to_hide]
    if hide_ids:
        hide = update(users).where(users.c.id.in_(hide_ids), users.c.role == READER).values(is_listed=False)
        done = conn.execute(hide).rowcount
        if done != len(hide_ids):
            raise Refusal(f"{done} readers hidden, {len(hide_ids)} planned. Rolled back, nothing was changed.")

    if conn.scalar(OWNERS_FINGERPRINT, {"roles": OWNERS}) != owners_before:
        raise Refusal("An owner or admin account would have changed. Rolled back, nothing was changed.")

    after, roles_after = table_counts(conn, db, touched), users_by_role(conn, db)
    print("\nCOUNTS BEFORE AND AFTER")
    for name in touched:
        print(f"  {name:<32} {before[name]:>7} -> {after[name]}")
    for key in sorted(set(roles_before) | set(roles_after)):
        print(f"  users {key:<26} {roles_before.get(key, 0):>7} -> {roles_after.get(key, 0)}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.launch_cleanup",
        description="Delete the test clients and hide the test readers. A dry run unless --apply is given.",
    )
    parser.add_argument("--keep-readers-created-after", required=True, type=parse_cutoff, metavar=CUTOFF_EXAMPLE,
                        help="readers created before this moment (UTC) are hidden and lose their chats; the rest are kept")
    parser.add_argument("--keep-client", action="append", type=int, default=[], metavar="ID",
                        help="a client account to keep; give it once per client")
    parser.add_argument("--apply", action="store_true", help="make the change; without it nothing is changed")
    args = parser.parse_args(argv)

    database = f"{engine.url.database} on {engine.url.host}"
    try:
        with engine.connect() as conn, conn.begin() as transaction:
            if not args.apply:
                conn.execute(text("SET TRANSACTION READ ONLY"))
            db = MetaData()
            db.reflect(bind=conn)
            links = find_links(db)
            plan = build_plan(conn, db, links, args.keep_readers_created_after, sorted(set(args.keep_client)))
            print_plan(plan, links, database, args.apply)
            if nothing_to_do(plan):
                print("\nNothing to do.")
                transaction.rollback()
                return 0
            if not args.apply:
                print(f"\n{APPLY_HINT}")
                transaction.rollback()
                return 0
            apply_plan(conn, db, plan)
        print("\nDone. The change is committed.")
        return 0
    except Refusal as refusal:
        print(f"\nREFUSED: {refusal}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
