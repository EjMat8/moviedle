# Moviedle — Local Dev Setup

Phase 0 setup. Goal: app loads inside Discord, shows your guild/channel ID and a Convex ping.

## Prerequisites

- Node 20+ and npm 10+
- A Discord account with permission to install activities (any account is fine for dev)
- `cloudflared` installed:
  - macOS: `brew install cloudflared`
  - Linux: see https://github.com/cloudflare/cloudflared/releases

## 1. Install dependencies

From the repo root:

```bash
npm install
```

This installs root deps plus the `activity/` workspace.

> **Heads up:** `npm run typecheck` will fail until step 3 below — TypeScript
> can't resolve `convex/_generated/*` until `npx convex dev` has generated it.
> This is normal.

## 2. Register the Discord application

1. Go to https://discord.com/developers/applications and click **New Application**.
2. Name it whatever you like (e.g. "Moviedle Dev").
3. Under **OAuth2**, copy the **Client ID** and **Client Secret**.
4. Under **Activities → Getting Started**, enable activities for this app.
5. Under **Activities → URL Mappings**, leave blank for now — we'll fill these in once we have a tunnel URL (step 4).

## 3. Set up Convex

From the repo root:

```bash
npx convex dev
```

The first run prompts you to create a project and prints a `CONVEX_URL` like
`https://your-project-name.convex.cloud`. Convex writes this to `.env.local`.

Copy that URL into `activity/.env.local`:

```bash
cp activity/.env.example activity/.env.local
# edit activity/.env.local and paste:
#   VITE_CONVEX_URL=https://your-project-name.convex.cloud
#   VITE_DISCORD_CLIENT_ID=<the client id from step 2>
```

Leave `npx convex dev` running — it watches `convex/` and live-deploys.

## 4. Start the tunnel + Activity

In another terminal, from the repo root:

```bash
npm run dev
```

This runs three processes concurrently:
- `convex dev` — backend watcher
- Vite dev server on `:5173`
- `cloudflared tunnel` — gives you a public HTTPS URL like
  `https://something-something.trycloudflare.com`

Copy the cloudflared URL.

## 5. Wire the tunnel URL into Discord

Back in the Discord developer portal, **Activities → URL Mappings**:

| Prefix | Target |
|--------|----------------------------------------|
| `/`    | `something-something.trycloudflare.com` |

Save. Discord will route activity requests through that URL.

## 6. Launch the activity

1. In any Discord voice channel you can join, click the **Activities** button (the rocket icon).
2. Find your dev app at the top of the list (it's only visible to you).
3. Click **Launch**.

You should see the Phase 0 ping screen with your `guildId`, `channelId`, `instanceId`, and a Convex `ping` response.

## Troubleshooting

- **"VITE_DISCORD_CLIENT_ID is not set"** — fill in `activity/.env.local`.
- **Convex query stays "Pinging…"** — check `VITE_CONVEX_URL` matches the URL printed by `npx convex dev`.
- **Activity won't load in Discord** — the cloudflared URL changes every restart; you have to update the URL mapping in the Discord portal each time, OR set up a named tunnel (see `cloudflared tunnel create`).
- **Discord SDK throws "ready" timeout** — you opened the Vite URL directly in a browser instead of inside Discord. The SDK only initializes when launched through the Discord client.

## Env var locations

| Var | Where | Set how |
|-----|-------|---------|
| `VITE_DISCORD_CLIENT_ID` | `activity/.env.local` | manual |
| `VITE_CONVEX_URL` | `activity/.env.local` | manual (copy from Convex output) |
| `ANTHROPIC_API_KEY` | Convex secrets | `npx convex env set ANTHROPIC_API_KEY <key>` |
| `DISCORD_CLIENT_ID` | Convex secrets | `npx convex env set DISCORD_CLIENT_ID <id>` |
| `DISCORD_CLIENT_SECRET` | Convex secrets | `npx convex env set DISCORD_CLIENT_SECRET <secret>` |
