import {
  DiscordSDK,
  patchUrlMappings,
  type DiscordSDKMock,
} from "@discord/embedded-app-sdk";

export type DiscordContext = {
  sdk: DiscordSDK | DiscordSDKMock | null;
  guildId: string | null;
  channelId: string | null;
  instanceId: string;
  inDiscord: boolean;
  userId: string;
  username: string | null;
};

export const isInDiscord = (): boolean =>
  new URLSearchParams(window.location.search).has("frame_id");

// `<deployment>.convex.cloud` (queries/mutations) and `<deployment>.convex.site`
// (httpActions) are different hosts. Derive the site host from the cloud one
// so we don't need a second env var.
function deriveSiteHost(cloudUrl: string | undefined): string | null {
  if (!cloudUrl) return null;
  try {
    const u = new URL(cloudUrl);
    if (u.host.endsWith(".convex.cloud")) {
      return u.host.replace(/\.convex\.cloud$/, ".convex.site");
    }
    return null;
  } catch {
    return null;
  }
}

// Discord Activities run in a sandboxed iframe; any host the app talks to must
// be declared in Discord's URL Mappings AND rewritten on the wire so fetch/WS
// use the activity origin. Run this BEFORE creating clients that open
// connections (e.g. ConvexReactClient) so its first WS hits the proxy.
//
// Two separate hosts to map:
//   /convex      → <deployment>.convex.cloud (queries/mutations/WS)
//   /convex-http → <deployment>.convex.site  (httpAction routes)
export function configureUrlMappings(): void {
  if (!isInDiscord()) return;

  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  if (!convexUrl) return;

  let convexHost: string;
  try {
    convexHost = new URL(convexUrl).host;
  } catch {
    return;
  }

  const mappings: { prefix: string; target: string }[] = [
    { prefix: "/convex", target: convexHost },
  ];
  const siteHost = deriveSiteHost(convexUrl);
  if (siteHost) {
    mappings.push({ prefix: "/convex-http", target: siteHost });
  }
  patchUrlMappings(mappings);
}

// Build a fetch URL for a Convex httpAction route. In Discord, routes through
// the portal mapping; locally, hits the .convex.site host directly.
export function getConvexHttpUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (isInDiscord()) return `/convex-http${normalized}`;
  const siteHost = deriveSiteHost(import.meta.env.VITE_CONVEX_URL);
  if (!siteHost) {
    throw new Error(
      "VITE_CONVEX_URL must be a .convex.cloud URL to derive the .site host.",
    );
  }
  return `https://${siteHost}${normalized}`;
}

let cached: Promise<DiscordContext> | null = null;

export function getDiscordContext(): Promise<DiscordContext> {
  if (cached) return cached;
  cached = buildContext();
  return cached;
}

async function buildContext(): Promise<DiscordContext> {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "VITE_DISCORD_CLIENT_ID is not set. Add it to activity/.env.local.",
    );
  }
  const inDiscord = isInDiscord();

  if (!inDiscord) {
    // Local-dev path: no Discord SDK, no OAuth. Stable per-browser id keeps
    // streaks consistent across page reloads while testing outside Discord.
    return {
      sdk: null,
      guildId: null,
      channelId: null,
      instanceId: "local-instance",
      inDiscord: false,
      userId: getLocalDevUserId(),
      username: "local-dev",
    };
  }

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  // Step 1: ask Discord for a one-time code authorizing the `identify` scope.
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  });

  // Step 2: hand the code to our backend, which trades it for an access_token
  // using the client_secret (server-only).
  const tokenResponse = await fetch(getConvexHttpUrl("/discord/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new Error(`Discord token exchange failed: ${text}`);
  }
  const { access_token } = (await tokenResponse.json()) as {
    access_token: string;
  };

  // Step 3: hand the access_token back to the SDK to "log in" the iframe.
  const auth = await sdk.commands.authenticate({ access_token });
  if (!auth || !auth.user) {
    throw new Error("Discord authenticate() returned no user");
  }

  // Prefer the modern global display name (`global_name`) over the unique
  // handle (`username`). Matches what Wordle/etc. show — "EJ" not
  // "ej_matugas". Older accounts may not have a global_name set, so fall
  // back. Cast because `global_name` isn't in older SDK type defs.
  const displayName =
    (auth.user as { global_name?: string | null }).global_name ||
    auth.user.username ||
    null;

  return {
    sdk,
    guildId: sdk.guildId,
    channelId: sdk.channelId,
    instanceId: sdk.instanceId,
    inDiscord: true,
    userId: auth.user.id,
    username: displayName,
  };
}

const LOCAL_DEV_KEY = "moviedle.localUserId";

function getLocalDevUserId(): string {
  try {
    const existing = localStorage.getItem(LOCAL_DEV_KEY);
    if (existing) return existing;
    const fresh = `local-${crypto.randomUUID()}`;
    localStorage.setItem(LOCAL_DEV_KEY, fresh);
    return fresh;
  } catch {
    return `local-${crypto.randomUUID()}`;
  }
}
