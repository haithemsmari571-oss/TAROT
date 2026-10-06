# Database backups

Every night at 03:15 UK time the server dumps the database, keeps the newest 14
dumps in `/root/backups`, and sends a copy to the private R2 bucket
`askvalentina-backups`, where copies older than 30 days are deleted.

- `backup_db.sh` takes the backup. By hand: `bash /root/TAROT/scripts/backup/backup_db.sh`
- `askvalentina-backup.cron` runs it every night (installed as `/etc/cron.d/askvalentina-backup`)
- `TAROT-BACKEND/scripts/backup_offsite.py` sends, lists and fetches the R2 copies, from inside the backend container

Every run writes to `/root/backups/backup.log`. The last result, OK or FAILED, is
in `/root/backups/LAST_RESULT`:

```
cat /root/backups/LAST_RESULT
tail -n 20 /root/backups/backup.log
```

The copies in R2:

```
cd /root/TAROT
docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python -m scripts.backup_offsite list --bucket askvalentina-backups
```

## Restoring a backup, step by step

Every command is typed on the server from `/root/TAROT`. In the commands,
`tarot-backup-2026-10-07-0315.sql.gz` stands for the backup chosen in step 2.

1. `cd /root/TAROT`

2. Choose the backup. The newest are on the server:

   ```
   ls -lt /root/backups/
   ```

   If they are gone, fetch one from R2. List them, then download one:

   ```
   docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python -m scripts.backup_offsite list --bucket askvalentina-backups
   docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python -m scripts.backup_offsite download --bucket askvalentina-backups --name tarot-backup-2026-10-07-0315.sql.gz > /root/backups/tarot-backup-2026-10-07-0315.sql.gz
   ```

3. Check the file. It must print OK:

   ```
   gzip -t /root/backups/tarot-backup-2026-10-07-0315.sql.gz && echo OK
   ```

4. Stop the backend, so nothing writes while the database is swapped. Sign-in and chats pause until step 9:

   ```
   docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml stop backend
   ```

5. Make an empty database beside the live one:

   ```
   docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" tarot_restore'
   ```

6. Load the backup into it. It prints nothing when it works, and stops at the first error, which it prints:

   ```
   gunzip -c /root/backups/tarot-backup-2026-10-07-0315.sql.gz | docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -q -o /dev/null -U "$POSTGRES_USER" -d tarot_restore'
   ```

7. Look inside. It prints how many accounts the backup holds:

   ```
   echo "SELECT count(*) FROM users;" | docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d tarot_restore'
   ```

8. Swap them, in two commands. The live database keeps its contents under the
   name `tarot_before_restore`, and the restored one takes the live name. Each answers `ALTER DATABASE`:

   ```
   docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE $POSTGRES_DB RENAME TO tarot_before_restore"'
   docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE tarot_restore RENAME TO $POSTGRES_DB"'
   ```

   If the first answers "is being accessed by other users", something still has
   the live database open. Stop it and run the first command again. Nothing has
   changed until it answers `ALTER DATABASE`.

9. Start the backend. It brings the restored database up to date with the code as it starts:

   ```
   docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml start backend
   ```

10. Check the site. Once it is right, delete the old database:

    ```
    docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" tarot_before_restore'
    ```

    To go back instead, stop the backend (step 4). Rename the restored database
    to `tarot_restore` and `tarot_before_restore` back to the live name (step 8
    with the names the other way round). Then start the backend (step 9).
