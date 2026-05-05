import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// CORS for the activity origin. Activities run from `<id>.discordsays.com`
// in production and from the Vite dev origin locally — both need preflight.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Exchange the one-time `code` from `sdk.commands.authorize()` for a Discord
// access_token. The client_secret stays server-side.
http.route({
  path: "/discord/token",
  method: "POST",
  handler: httpAction(async (_ctx, req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "invalid JSON body", CORS_HEADERS);
    }
    const code =
      body && typeof body === "object" && "code" in body
        ? (body as { code: unknown }).code
        : undefined;
    if (typeof code !== "string" || code.length === 0) {
      return jsonError(400, "missing 'code' field", CORS_HEADERS);
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return jsonError(
        500,
        "Discord credentials not configured. Run: npx convex env set DISCORD_CLIENT_ID <id> && npx convex env set DISCORD_CLIENT_SECRET <secret>",
        CORS_HEADERS,
      );
    }

    const tokenResponse = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      return jsonError(
        tokenResponse.status,
        `Discord token exchange failed: ${text}`,
        CORS_HEADERS,
      );
    }

    const data = (await tokenResponse.json()) as { access_token?: string };
    if (!data.access_token) {
      return jsonError(
        502,
        "Discord token response missing access_token",
        CORS_HEADERS,
      );
    }

    return new Response(JSON.stringify({ access_token: data.access_token }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }),
});

http.route({
  path: "/discord/token",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }),
});

// Discord Interactions endpoint. Wired in the Developer Portal under
// "General Information → Interactions Endpoint URL". Discord PINGs this URL
// at registration and on every interaction (button click, slash command).
// Every request is signed with Ed25519; we MUST verify before doing anything.
http.route({
  path: "/discord/interactions",
  method: "POST",
  handler: httpAction(async (_ctx, req) => {
    const signature = req.headers.get("X-Signature-Ed25519");
    const timestamp = req.headers.get("X-Signature-Timestamp");
    if (!signature || !timestamp) {
      return new Response("missing signature headers", { status: 401 });
    }

    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
      console.error("DISCORD_PUBLIC_KEY not configured");
      return new Response("server not configured", { status: 500 });
    }

    const bodyText = await req.text();
    const valid = await verifyDiscordSignature(
      publicKey,
      signature,
      timestamp + bodyText,
    );
    if (!valid) {
      return new Response("invalid signature", { status: 401 });
    }

    let interaction: { type: number; data?: { custom_id?: string } };
    try {
      interaction = JSON.parse(bodyText);
    } catch {
      return new Response("invalid JSON", { status: 400 });
    }

    // Type 1 = PING — Discord uses this to validate the endpoint.
    if (interaction.type === 1) {
      return Response.json({ type: 1 });
    }

    // Type 3 = MESSAGE_COMPONENT (button click).
    if (interaction.type === 3) {
      if (interaction.data?.custom_id === "launch_activity") {
        // Type 12 = LAUNCH_ACTIVITY — Discord launches the activity for the
        // user who clicked, in whatever channel the message lives in.
        return Response.json({ type: 12 });
      }
    }

    // Unknown interaction → ephemeral fallback so users see something.
    return Response.json({
      type: 4,
      data: { content: "Hmm, that button isn't wired up yet.", flags: 64 },
    });
  }),
});

async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  message: string,
): Promise<boolean> {
  try {
    const publicKey = hexToBytes(publicKeyHex);
    const signature = hexToBytes(signatureHex);
    const messageBytes = new TextEncoder().encode(message);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      publicKey,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      cryptoKey,
      signature,
      messageBytes,
    );
  } catch (e) {
    console.error("Discord signature verify threw:", e);
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const len = hex.length % 2 === 0 ? hex.length / 2 : 0;
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len * 2; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function jsonError(
  status: number,
  message: string,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export default http;
