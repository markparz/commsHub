---
name: comms-hub-ops
description: >-
  Operate Comms Hub (markparz/commsHub): pull main, Podman build/redeploy using
  each person's HOST_PORT from .env.local, Status git sync, OAuth env, and Gmail
  quota-safe settings. Use when the user invokes comms-hub-ops or asks to
  redeploy/restart Comms Hub with Podman.
disable-model-invocation: true
---

# Comms Hub Ops

Ops playbook for **Comms Hub** (`https://github.com/markparz/commsHub`).

## Progress messages (required)

Announce each step to the user **as you start it** (short chat lines). Use this sequence for a normal redeploy:

1. `comms-hub-ops: resolving personal port from .env.local…`
2. `comms-hub-ops: pulling latest main…`
3. `comms-hub-ops: stopping existing container (if any)…`
4. `comms-hub-ops: building image for http://localhost:<PORT>…`
5. `comms-hub-ops: starting container on host port <PORT>…`
6. `comms-hub-ops: health-checking http://localhost:<PORT>/…`
7. If primary port fails: `comms-hub-ops: port <PORT> failed — falling back to 3000…` then repeat build/run/health for 3000
8. `comms-hub-ops: done — app live at <URL>`

For commit/push tasks, also announce: `staging…`, `committing…`, `pushing to main…` before those git steps.

Never print secrets (tokens, client secrets). Redact in logs.

## Defaults

| Item | Value |
|------|--------|
| Checkout | `~/git/commsHub` (or the repo root if already there) |
| Image | `localhost/comms-hub:local` |
| Container | `comms-hub` |
| Env file | `<checkout>/.env.local` |
| Status mount | checkout → `/repo` (`STATUS_REPO_ROOT=/repo`) |
| Demo mode (real data) | `NEXT_PUBLIC_DEMO_MODE=false` |
| Container listen port | `3000` (mapped from host port) |

## Personal port (per person)

Each developer sets their own host port in **`.env.local`** (gitignored):

```bash
HOST_PORT=8082
NEXT_PUBLIC_APP_URL=http://localhost:8082
GOOGLE_REDIRECT_URI=http://localhost:8082/api/auth/google/callback
SLACK_REDIRECT_URI=http://localhost:8082/api/auth/slack/callback
```

### Resolve PORT

1. If `HOST_PORT` is set in `.env.local`, use it.
2. Else parse the port from `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:8082` → `8082`).
3. Else default to **8082**.
4. Set `APP_URL=http://localhost:$PORT`.

**Fallback:** If bind/start/health-check on `$PORT` fails, tear down and retry with **3000**. Tell the user to align OAuth redirect URIs with 3000 if they stay there.

## When invoked

1. Resolve checkout + personal `PORT` / `APP_URL` first; announce it.
2. Prefer Podman over bare `npm` unless the user asks for `npm run dev`.
3. Never commit `.env.local` or tokens.
4. Only `git commit` / `git push` when the user asks (or clearly implies publish).

## Redeploy workflow

Announce steps as you go.

```bash
cd "$CHECKOUT"   # usually ~/git/commsHub
# PORT and APP_URL already resolved from .env.local

git pull --ff-only origin main

podman rm -f comms-hub 2>/dev/null || true
podman build -t localhost/comms-hub:local -f Containerfile \
  --build-arg NEXT_PUBLIC_DEMO_MODE=false \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  .

UID_GID="$(id -u):$(id -g)"
podman run -d \
  --name comms-hub \
  --user "$UID_GID" \
  --userns=keep-id \
  -p "${PORT}:3000" \
  --env-file "$CHECKOUT/.env.local" \
  -e STATUS_REPO_ROOT=/repo \
  -e STATUS_GIT_SYNC=true \
  -e NEXT_PUBLIC_APP_URL="$APP_URL" \
  -e HOME=/tmp \
  -v "$CHECKOUT":/repo:z \
  localhost/comms-hub:local

sleep 2
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:${PORT}/"
```

### Fallback to 3000

If `$PORT` fails:

1. Announce fallback
2. `podman rm -f comms-hub`
3. Rebuild with `NEXT_PUBLIC_APP_URL=http://localhost:3000`
4. Run with `-p 3000:3000`
5. Health-check `http://localhost:3000/`
6. Finish with the live URL and OAuth reminder

## Status pane git sync

- File: `data/team-status.json`
- Mount checkout at `/repo`; `STATUS_REPO_ROOT=/repo`
- Token: `STATUS_GIT_TOKEN` or `GH_TOKEN` in `.env.local` (`gh auth token`)
- Do not print token values

## OAuth / env checklist

- `NEXT_PUBLIC_DEMO_MODE=false` for real Slack/Google
- Redirect URIs must use **this person's** `HOST_PORT` / `APP_URL`
- After `.env.local` changes: recreate container (`rm` + `run`), not just `restart`

## Gmail quota guardrails

- Max **25** threads; ~**2 min** server cache; UI refresh ~**10 min**
- Do not add aggressive Gmail polling
- On quota errors: wait ~60s, then retry once

## Verify before finishing

- [ ] Announced each step
- [ ] `comms-hub` is up on the resolved (or fallback) port
- [ ] HTTP 200 on live URL
- [ ] Optional: `/api/auth/status` and `/api/status` (redact secrets)
- [ ] Tell the user: `App live at http://localhost:<PORT>`

## Sample kickoff prompt

```text
comms-hub-ops: pull latest and redeploy using my .env.local port
```
