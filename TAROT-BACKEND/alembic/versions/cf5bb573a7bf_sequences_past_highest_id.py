"""Move every id sequence past its table's highest id.

A row inserted with an explicit id (a seed, a restore, a copy between
databases) does not move the sequence that feeds the column. The next insert
then draws a number that is already taken and fails on the primary key. That
is how two local sign-ups answered 500 (users_id_seq stood at 96 while readers
97 and 99 existed).

For every sequence in the public schema that feeds an integer column of a
public table (serial or identity), this moves the sequence to the table's
highest value when nextval would otherwise hand out a number at or below it:
setval to GREATEST(last_value, MAX). It never moves a sequence backwards,
leaves the sequence of an empty table alone and changes no row. Running it
again changes nothing, so it is safe in a normal deploy.

Revision ID: cf5bb573a7bf
Revises: 1ff3c66c2a5d
"""

import logging

import sqlalchemy as sa
from alembic import op


revision = "cf5bb573a7bf"
down_revision = "1ff3c66c2a5d"
branch_labels = None
depends_on = None


log = logging.getLogger("alembic.runtime.migration")

# Each sequence owned by an integer column of a public table: a serial's
# OWNED BY ('a') or an identity column's ('i').
FED_SEQUENCES = sa.text(
    """
    SELECT s.oid::regclass::text AS seq, t.relname AS tbl, a.attname AS col
    FROM pg_class s
    JOIN pg_namespace sn ON sn.oid = s.relnamespace AND sn.nspname = 'public'
    JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = s.oid
        AND d.deptype IN ('a', 'i')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S'
      AND a.atttypid IN ('smallint'::regtype, 'integer'::regtype, 'bigint'::regtype)
    ORDER BY t.relname, a.attname
    """
)


def upgrade() -> None:
    bind = op.get_bind()
    quote = bind.dialect.identifier_preparer.quote
    for seq, tbl, col in bind.execute(FED_SEQUENCES).all():
        # One statement reads the sequence and the table and moves it, so the
        # sequence is read as late as possible. The WHERE is "nextval would give
        # a taken number": last_value below the top, or equal to it and not yet
        # handed out. An empty table's MAX is NULL, so no row, no change.
        moved = bind.execute(
            sa.text(
                f"SELECT s.last_value AS was, s.is_called AS was_used, "
                f"setval(:seq, GREATEST(s.last_value, m.top)) AS now "
                f"FROM {seq} s, (SELECT max({quote(col)}) AS top FROM public.{quote(tbl)}) m "
                "WHERE m.top IS NOT NULL "
                "AND (s.last_value < m.top OR (s.last_value = m.top AND NOT s.is_called))"
            ),
            {"seq": seq},
        ).first()
        if moved is not None:
            log.info(
                "Moved %s past %s.%s = %s (it stood at %s%s)",
                seq, tbl, col, moved.now, moved.was, "" if moved.was_used else ", not yet handed out",
            )


def downgrade() -> None:
    # Nothing to undo. Moving a sequence back below its table's highest id
    # would only bring back the collisions this fixes, and setval is not
    # transactional, so there is no earlier state to restore.
    pass
