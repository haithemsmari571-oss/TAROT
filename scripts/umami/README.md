# Visitor statistics: Umami on the server

Ask Valentina counts its visits with Umami, on the site's own server. It sets no cookie and keeps nothing that names a visitor. A browser that asks "Do Not Track" sends nothing. The owner's admin (/owner) and the web admin (/admin) are never counted.

- **The dashboard:** https://visits.askvalentina.co.uk, behind Umami's own sign-in.
- **The site's pages load the counter from the site itself:** /av/s.js, and it sends to /av/e (tarot-landing-web/nginx.conf).
- **It counts** page views and six moments: signup_completed, first_message_sent, topup_started, topup_completed (with the amount's band only, for example "£20-£49"), app_installed, notifications_enabled (tarot-landing-web/src/features/analytics/analytics.ts).
- **Its files:** docker-compose.umami.yml (the container, its own compose project), make-secrets.sh and start.sh beside this file.
  - Its data lives in its own database, `umami`, with its own user, `umami`, inside the site's postgres container. The site's own database is never touched.

Every command is typed on the server as root, from `/root/TAROT`, after the commit that brings these files has been deployed.

## 1. Make the secrets (once)
```
cd /root/TAROT
bash scripts/umami/make-secrets.sh
```
- It writes `/root/TAROT/.env.umami`: three long random secrets, readable by root only. None is shown.
- Run again, it changes nothing.
- Never print, copy or commit that file.

## 2. Start Umami
```
df -h /
bash scripts/umami/start.sh
```
- The first line shows the free disk space. Umami needs about 1.5 GB the first time.
- `start.sh` takes a few minutes the first time and ends **"Done. Umami is running."** It:
  - makes Umami's database and user;
  - starts the container (at most 512 MB of memory and half a CPU);
  - adds the site "Ask Valentina" with the id the pages send.
- Its step 4 says **"STILL UMAMI'S FIRST PASSWORD"** until step 4 below is done.
- It can be run again at any time, for example after a server restart or to check. A line starting **FAILED** names the step; `docker logs tarot-umami` says why.
- If step 2 fails with "network tarot_default … not found", the site's network has another name on this server: send the output of `docker network ls` to the planner.
- From this moment the site's visits are counted, even before the dashboard has its address.

## 3. The dashboard's address (once)
**a. The DNS record at Namecheap.** askvalentina.co.uk's DNS is served by Namecheap (dns1/dns2.registrar-servers.com).
- Namecheap → Domain List → askvalentina.co.uk → **Manage** → **Advanced DNS** → **Add New Record**.
- Type **A Record**, Host **visits**, Value **72.61.17.226**, TTL **Automatic**. Save (the green tick).
- Check from any computer: `nslookup visits.askvalentina.co.uk` must answer 72.61.17.226. That usually takes a few minutes, at most about an hour.

**b. Its certificate, on the server, once the record answers:**
```
certbot --version
mkdir -p /var/www/certbot
certbot certonly --webroot -w /var/www/certbot -d visits.askvalentina.co.uk --non-interactive --agree-tos --register-unsafely-without-email
```
- The first line must print a version. If it says "command not found", first run `apt-get install -y certbot`.
- The last line ends with "Successfully received certificate".
- Nothing needs restarting: nginx reads the certificate when a browser connects. certbot renews it by itself, the same way.
- Check: https://visits.askvalentina.co.uk opens Umami's sign-in page with the padlock.

**Until the address is ready** (the record or the certificate still missing), the dashboard opens from a computer through the SSH connection:
```
ssh -L 3031:127.0.0.1:3031 root@72.61.17.226
```
- Typed on the computer, not the server. Leave that window open and visit http://localhost:3031 on the same computer.
- The dashboard is reachable this way only through that SSH connection, never from the internet.

## 4. First sign-in: change the password at once
1. Open https://visits.askvalentina.co.uk (or the SSH address above) on the phone.
2. Sign in with Umami's first account: username **admin**, password **umami**.
3. Open **Settings** → **Profile** (the address /settings/profile).
4. **Change password**: the current password `umami`, then the new one twice. Save.
5. Sign out and sign in again with the new password.
6. On the server, `bash scripts/umami/start.sh` now ends its step 4 with **"changed: Umami's first password no longer opens it."**

Keep the new password in a password manager. Umami cannot email a forgotten password.

## What the dashboard shows
- **Websites → Ask Valentina:** visitors, visits, page views, the pages, where visitors came from, countries, devices.
- **Events:** the six moments by name. topup_completed carries the band only.

## Stopping or starting it by hand
- `docker stop tarot-umami` stops the counting. The site goes on working; the counter's two addresses answer 502 and nothing is counted.
- `docker start tarot-umami` starts it again.
