# Deploying RHD-CES

Production runs at **https://estimation.rhdbridge.com** on the shared VPS
`62.171.150.194`, next to the other rhdbridge.com apps. Once set up,
**every merge to `main` deploys automatically**. This guide covers the
one-time setup, the move from the old hand-built deployment, and day-to-day
operation.

## How it works

```
 PR ──► CI ──► review ──► merge to main ──► GitHub Actions
                                              │ CI again, build changed images
                                              ▼
                                    ghcr.io (tagged with the commit SHA)
                                              │ ssh: deploy.sh <service> <sha>
┌───────────────────────── VPS ───────────────▼──────────────────────────────┐
│ Internet ─443─► edge nginx (host, shared) ─► 127.0.0.1:8003                 │
│                  /etc/nginx/sites-enabled/       │                          │
│                  estimation.rhdbridge.com.conf   ▼                          │
│                                     /opt/rhd-ces (compose project rhd-ces) │
│                                     frontend (nginx) ─/api/*─► backend ─► db │
└────────────────────────────────────────────────────────────────────────────┘
```

- App and API share one domain: `/` is the app, `/api/...` the API. Login
  cookies are first-party; no CORS setup needed.
- The **host's nginx** owns ports 80/443, TLS and hostnames for every app on
  the VPS. CI **never** touches nginx; the RHD site file is installed by
  hand once (step 5). RHD itself only listens on `127.0.0.1:8003`.
- **Every deploy** pulls the new image, backs up the database first
  (backend only), starts the new container and waits for its health check.
  If it never becomes healthy, the previous version is put back
  automatically and the GitHub run fails.
- Only the parts that changed are rebuilt and redeployed (`backend/`,
  `frontend/`, or the `deploy/` bundle).
- Database migrations run automatically when the new backend starts.
- Nightly backups (02:30) and the hourly purge of expired works run from
  cron on the server (`/etc/cron.d/rhd-ces`, already installed).

| Event | What runs |
| --- | --- |
| Pull request / push to another branch | `CI`: backend lint, security scan, tests on SQLite and PostgreSQL, migrations up/down/up, frontend unit tests + build, Playwright end-to-end, deploy-bundle and image checks |
| Push / merge to `main` | `Deploy`: CI → build changed images → deploy → smoke test |

Nothing is deployed if any check fails.

---

## One-time setup

The server is already prepared: Docker, the `deploy` user, `/opt/rhd-ces`,
swap and the cron jobs exist. (For a brand-new server, run
`deploy/bootstrap-vps.sh` as root first.)

Commands marked **[PC]** run on your computer (Git Bash), **[VPS]** on the
server.

### 1. Store the deploy key safely

GitHub Actions logs in as `deploy` with the key pair `rhd-ces-deploy` /
`rhd-ces-deploy.pub`. Its public half is already in
`/home/deploy/.ssh/authorized_keys`. Keep the private half out of the
project folder (it was moved to `~/.ssh/rhd-ces-deploy`); after step 3
GitHub holds a copy.

```bash
# [PC] check it works -- should list the running containers
ssh -i ~/.ssh/rhd-ces-deploy deploy@62.171.150.194 'docker ps'
```

### 2. Create the server's `.env`

This file holds the production secrets and lives only on the server.

```bash
# [PC] copy the template up
scp -i ~/.ssh/rhd-ces-deploy deploy/.env.example deploy@62.171.150.194:/opt/rhd-ces/.env
# [VPS]
ssh -i ~/.ssh/rhd-ces-deploy deploy@62.171.150.194
cd /opt/rhd-ces && chmod 600 .env
openssl rand -hex 32   # run twice: once for SECRET_KEY, once for DB_PASSWORD
nano .env              # paste them in; the other defaults are already right
```

**Keep a copy of `SECRET_KEY` and `DB_PASSWORD` in a password manager.**
Without `DB_PASSWORD` the backups can't be restored into a fresh server.

### 3. Configure GitHub (repository `Mazhar42/RHD-Estimation`)

**Settings → Environments → New environment → `production`**, then under
*Environment secrets* add:

| Name | Value |
| --- | --- |
| `VPS_HOST` | `62.171.150.194` |
| `VPS_SSH_KEY` | full contents of `~/.ssh/rhd-ces-deploy` (the private key, including the `BEGIN`/`END` lines) |
| `VPS_KNOWN_HOSTS` | output of `ssh-keyscan 62.171.150.194`, run in **Git Bash**. Windows' own `ssh-keyscan` is too old for this server and prints no keys. From PowerShell: `& 'C:\Program Files\Git\usr\bin\ssh-keyscan.exe' 62.171.150.194 2>$null \| Set-Clipboard`, then paste. |

and under *Environment variables*:

| Name | Value |
| --- | --- |
| `PUBLIC_URL` | `https://estimation.rhdbridge.com` (enables the after-deploy smoke test) |

Optional, on the same page: **Required reviewers**. Every production deploy
then waits for someone to click *Approve* in the Actions tab.

Images are published to GitHub Container Registry automatically; the deploy
job lends the server a short-lived pull token and removes it afterwards.

### 4. Protect `main`

**Settings → Branches → Add branch ruleset** (or *Add rule*) for `main`:

- Require a pull request before merging, with **1 approval**
- Require status checks to pass: add **`CI passed`** (it appears in the
  list after CI has run once), and require branches to be up to date
- Block force pushes; restrict deletions
- Leave yourself *bypass* permission only if you really need it

From then on, everyone (you included) works on a branch and opens a pull
request; merging it deploys.

### 5. DNS, certificate and nginx site

```bash
# DNS (at your domain registrar / DNS host): add an A record
#   estimation.rhdbridge.com  ->  62.171.150.194
# [PC] wait until it resolves:
nslookup estimation.rhdbridge.com
```

Then on the server, as a user with `sudo` (the `deploy` user has none):

```bash
# [VPS] copy the site file over first: [PC]
#   scp -i ~/.ssh/rhd-ces-deploy deploy/nginx/estimation.rhdbridge.com.conf deploy@62.171.150.194:/tmp/
# 1. Certificate -- the catch-all :80 server already serves ACME challenges
#    from /var/www/certbot, so no nginx change is needed for this:
sudo certbot certonly --webroot -w /var/www/certbot -d estimation.rhdbridge.com
# 2. Site file
sudo mv /tmp/estimation.rhdbridge.com.conf /etc/nginx/sites-available/
sudo chown root:root /etc/nginx/sites-available/estimation.rhdbridge.com.conf
sudo ln -s ../sites-available/estimation.rhdbridge.com.conf /etc/nginx/sites-enabled/
# 3. Always test before reloading -- a broken file would take down every site
sudo nginx -t && sudo systemctl reload nginx
```

Also add `8003 -> RHD-CES (/opt/rhd-ces)` to the port registry in
`/etc/nginx/sites-available/README.md`.

Certificate renewal is automatic (certbot's timer, same as the other sites).

### 6. First deploy

Push the repository's `main` (or **Actions → Deploy → Run workflow**). Wait
for it to go green, then check https://estimation.rhdbridge.com/api/health
returns `{"status":"healthy",...}`.

The app is now running, with an empty database.

### 7. Bring over the existing data (cutover from the old deployment)

The old deployment (`/opt/rhd-ces/backend`, serving `rhdbridge.com` on
port 8001) holds the current production data. `import-legacy-db.sh` copies
it into the new stack. The old database is only read, never changed.

```bash
# [VPS] as deploy, in /opt/rhd-ces
./import-legacy-db.sh --rehearse   # trial run; the old app keeps running
```

Log in at https://estimation.rhdbridge.com with an existing account and
check the works and item master look right. (Everyone has to log in again
on the new site; passwords are unchanged.) Then, at a quiet time:

```bash
./import-legacy-db.sh              # stops the old backend, copies, migrates
```

From that moment `rhdbridge.com` stops working for RHD. Users go to
`estimation.rhdbridge.com`. If anything fails, the script starts the old
backend again, so nothing is lost.

**If there was no old data** (a fresh install), create the first admin
instead:

```bash
docker compose exec backend python -m app.cli create-admin
```

### 8. Retire the old deployment (after a week or so)

```bash
# [VPS] keep a final copy of the old database first
docker exec rhd-estimation-db-prod sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > /opt/rhd-ces/backups/legacy-final.sql.gz
# then stop it (as root, since its files are root-owned); the volume is kept
sudo docker compose -f /opt/rhd-ces/backend/docker-compose.prod.yml down
```

Decide what `rhdbridge.com` should show now. To send it to the new address,
replace the `location /` block in
`/etc/nginx/sites-available/rhdbridge.com.conf` with
`return 301 https://estimation.rhdbridge.com$request_uri;`, then
`sudo nginx -t && sudo systemctl reload nginx`.

Once you're sure, `/opt/rhd-ces/backend` and `/opt/rhd-ces/frontend` (and
eventually the `backend_postgres_data_prod` volume) can be removed.

---

## Everyday use

```bash
git switch -c feature/my-change      # branch off main
# ... edit, test locally ...
git push -u origin feature/my-change # then open a pull request on GitHub
```

CI runs on the pull request. After approval, **merge** and it deploys
(about 5–10 minutes, mostly tests). Watch it under **Actions**.
**Actions → Deploy → Run workflow** redeploys `main` by hand.

## Operating the server

All commands run on the server as `deploy`, in `/opt/rhd-ces`.

```bash
./deploy.sh status                 # running versions + container health
docker compose logs -f backend     # live logs (also: frontend, db)
./deploy.sh rollback backend       # return to the previous version
./deploy.sh backend <commit-sha>   # run any specific published version
./deploy.sh up                     # (re)start everything, e.g. after editing .env
```

### Backups

- Nightly at 02:30 (server time) and before every backend deploy, into
  `/opt/rhd-ces/backups/`. Kept for `BACKUP_KEEP_DAYS` days (default 14).
- Take one now: `./backup.sh manual`
- **Copy them off the server.** A backup on the same disk won't survive
  losing the server. From your computer:
  `scp -i ~/.ssh/rhd-ces-deploy 'deploy@62.171.150.194:/opt/rhd-ces/backups/*.sql.gz' ./rhd-backups/`

**Restore** (replaces the current data with the backup's):

```bash
docker compose stop backend
gunzip -c backups/rhd-ces-daily-YYYYMMDDTHHMMSSZ.sql.gz \
  | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose start backend
```

If a backend deploy was rolled back **after** running a new database
migration, restore that deploy's `rhd-ces-pre-deploy-*.sql.gz` file.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Deploy job: *“VPS_HOST / VPS_SSH_KEY are not set”* | Step 3 not done, or secrets added to the repo instead of the `production` environment (either works, check spelling). The images were still published. |
| *Permission denied (publickey)* | `VPS_SSH_KEY` isn't the full private key, or the public key is missing from `/home/deploy/.ssh/authorized_keys`. |
| *Host key verification failed* | The server was rebuilt; refresh `VPS_KNOWN_HOSTS` with `ssh-keyscan`. |
| *“.env is missing on the server”* | Step 2. |
| *“did not become healthy; rolling back”* | The job log shows the new container's last log lines. Fix and push again; the old version keeps running meanwhile. |
| Site shows *502 Bad Gateway* | The stack isn't running: `./deploy.sh status`, then `./deploy.sh up`. |
| Browser: *connection reset* / TLS error | The site file isn't enabled or its certificate is missing (the catch-all rejects unknown hostnames on purpose). Step 5. |
| Can log in but get logged out at once | `PUBLIC_URL` / `COOKIE_SECURE` don't match the address you're using. |
| *“Too many attempts”* on login | Rate limit: 5 attempts per minute. Wait a minute. |

## Security notes

- Only the host's nginx is exposed. RHD's containers listen on loopback or
  their private network only.
- The `deploy` user can run Docker, which is root-equivalent on that
  server, and that includes the other apps' containers. Treat
  `VPS_SSH_KEY` accordingly; requiring reviewers on the `production`
  environment (step 3) limits who can trigger a deploy.
- `deploy.sh` only prunes images labelled `com.rhdbridge.app=rhd-ces`, so it
  never removes other projects' images.
- API docs (`/docs`) are switched off in production.
