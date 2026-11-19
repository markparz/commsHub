# Comms Hub

Single-panel workspace for **Slack**, **Gmail**, **Google Calendar**, **Status**, and **Quick Links**, with desktop + in-app alerts **1 minute before** meetings.

## Quick start (demo)

Demo mode is on by default — no OAuth keys required.

```bash
export PATH="$HOME/.local/node-v22.22.0-darwin-arm64/bin:$PATH"
cd ~/git/commsHub   # or your clone path
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Panes: Slack · Calendar · Gmail · Status · Quick Links  
- Click **Enable alerts** and allow notifications  
- Demo calendar includes a meeting ~2 minutes out so you can verify the 1-minute alert

## Connect real Slack + Google

1. Copy `.env.example` → `.env.local` and fill in credentials.
2. Set `NEXT_PUBLIC_DEMO_MODE=false`.

### Google (Gmail + Calendar)

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project  
2. Enable **Gmail API** and **Google Calendar API**  
3. Create **OAuth 2.0 Client ID** (Web application)  
4. Authorized redirect URI (match the port you use):
   - Dev: `http://localhost:3000/api/auth/google/callback`
   - Podman on 8082: `http://localhost:8082/api/auth/google/callback`
5. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`

### Slack (option A — bot token, recommended)

1. [Create a Slack app](https://api.slack.com/apps) → **From scratch**  
2. **OAuth & Permissions** → Bot Token Scopes → add:  
   `channels:history`, `channels:read`, `chat:write`, `groups:history`, `groups:read`, `im:history`, `im:read`, `mpim:history`, `users:read`  
3. Click **Install to Workspace** (or Reinstall) and allow access  
4. Copy **Bot User OAuth Token** (`xoxb-…`) into `.env.local`:
   ```bash
   SLACK_BOT_TOKEN=xoxb-your-token-here
   ```
5. Restart `npm run dev` — Slack connects automatically (no **Connect Slack** click)  
6. Invite the bot to any private channels you want to see (`/invite @YourApp`)

### Slack (option B — browser OAuth)

1. Same app as above  
2. **OAuth & Permissions** → Redirect URL: `http://localhost:3000/api/auth/slack/callback`  
3. Put `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` in `.env.local`  
4. Restart, then use **Connect Slack** in the UI

Restart `npm run dev`, then use **Connect Google** (and **Connect Slack** if using OAuth) in the UI.

## Team Status pane (shared via git)

The **Status** pane is a shared team feed stored in `data/team-status.json`.

- Every calendar day, **`@computer`** automatically adds a dated timestamp entry  
- When someone posts a status, the app **pulls**, updates the file, **commits**, and **pushes** to `main`  
- Teammates see updates after refresh (or within ~10 minutes via auto-refresh)

### One-time setup

In `.env.local`:

```bash
# Path to this git checkout (host path for npm; /repo when using Podman mount below)
STATUS_REPO_ROOT=/Users/YOU/git/commsHub
STATUS_GIT_SYNC=true
STATUS_AUTHOR=your-name
STATUS_GIT_AUTHOR_NAME=Comms Hub
STATUS_GIT_AUTHOR_EMAIL=comms-hub@localhost

# Required for commit/push from the app (GitHub CLI token works)
STATUS_GIT_TOKEN=ghp_or_gho_token_here
# or: GH_TOKEN=...
```

Get a token with GitHub CLI:

```bash
gh auth token
```

Paste that value into `STATUS_GIT_TOKEN` (do **not** commit `.env.local`).

Your GitHub user must be able to **push to `main`** on this repo.

### Using Status

1. Open the **Status** pane  
2. Enter your name (saved in the browser)  
3. Write an update → **Post status**  
4. Confirm the UI hint says the update was committed and pushed  
5. Teammates: pull latest code / refresh Status to see it

### Files involved

| Path | Purpose |
|------|---------|
| `data/team-status.json` | Shared status feed (tracked in git) |
| `/api/status` | GET loads (+ daily `@computer` stamp); POST adds an entry |

## Run with Podman (port 8082)

From the repo root:

```bash
# Build (demo off for real OAuth)
podman build -t localhost/comms-hub:local -f Containerfile \
  --build-arg NEXT_PUBLIC_DEMO_MODE=false \
  --build-arg NEXT_PUBLIC_APP_URL=http://localhost:8082 \
  .

# Run with git checkout mounted so Status can commit/push
podman rm -f comms-hub 2>/dev/null || true
podman run -d \
  --name comms-hub \
  --user "$(id -u):$(id -g)" \
  --userns=keep-id \
  -p 8082:3000 \
  --env-file .env.local \
  -e STATUS_REPO_ROOT=/repo \
  -e STATUS_GIT_SYNC=true \
  -e STATUS_GIT_TOKEN="$(gh auth token)" \
  -e HOME=/tmp \
  -v "$PWD":/repo:z \
  localhost/comms-hub:local
```

Open [http://localhost:8082](http://localhost:8082).

Useful commands:

```bash
podman logs -f comms-hub
podman stop comms-hub
podman start comms-hub
```

**Google redirect URI** for this setup must be:

`http://localhost:8082/api/auth/google/callback`

## Meeting alerts

While the app tab is open:

1. Calendar events are polled every ~20s for alert scheduling  
2. Each event is scheduled to fire at **start − 60 seconds**  
3. You get an in-app banner and a browser `Notification` (if permitted)  
4. **Join** opens the Meet/Zoom link when present

Keep the tab open (or pinned) for reliable reminders; browsers cannot wake a fully closed tab without a push service.

## Gmail refresh

- Inbox loads the latest **100** threads  
- Auto-refresh runs every **10 minutes** (to stay under API limits)

## Stack

Next.js 15 · React 19 · Tailwind 4 · `googleapis` · `@slack/web-api` · `iron-session` · Podman/`Containerfile`
