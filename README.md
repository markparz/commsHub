# Comms Hub

Single-panel workspace for **Slack**, **Gmail**, and **Google Calendar**, with desktop + in-app alerts **1 minute before** meetings.

## Quick start (demo)

Demo mode is on by default — no OAuth keys required.

```bash
export PATH="$HOME/.local/node-v22.22.0-darwin-arm64/bin:$PATH"
cd ~/comms-hub
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Three panes: Slack · Gmail · Calendar  
- Click **Enable alerts** and allow notifications  
- Demo calendar includes a meeting ~2 minutes out so you can verify the 1-minute alert

## Connect real Slack + Google

1. Copy `.env.example` → `.env.local` and fill in credentials.
2. Set `NEXT_PUBLIC_DEMO_MODE=false`.

### Google (Gmail + Calendar)

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project  
2. Enable **Gmail API** and **Google Calendar API**  
3. Create **OAuth 2.0 Client ID** (Web application)  
4. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`  
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

## Meeting alerts

While the app tab is open:

1. Calendar events are polled every ~30s  
2. Each event is scheduled to fire at **start − 60 seconds**  
3. You get an in-app banner and a browser `Notification` (if permitted)  
4. **Join** opens the Meet/Zoom link when present

Keep the tab open (or pinned) for reliable reminders; browsers cannot wake a fully closed tab without a push service.

## Stack

Next.js 15 · React 19 · Tailwind 4 · `googleapis` · `@slack/web-api` · `iron-session`
