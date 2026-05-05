"use node";

const API_BASE = "https://discord.com/api/v10";

export type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
};

export type DiscordButton = {
  type: 2;
  style: 1 | 2 | 3 | 4 | 5;
  label: string;
  custom_id?: string;
  url?: string;
};

export type DiscordActionRow = {
  type: 1;
  components: DiscordButton[];
};

export type DiscordMessagePayload = {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  allowed_mentions?: { parse?: string[] };
};

export type BotResult = "posted" | "skipped-no-config" | "error";

function getBotConfig(): { token: string; channelId: string } | null {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_BOT_TEXT_CHANNEL_ID;
  if (!token || !channelId) return null;
  return { token, channelId };
}

export async function postBotMessage(
  payload: DiscordMessagePayload,
): Promise<BotResult> {
  const config = getBotConfig();
  if (!config) return "skipped-no-config";
  try {
    const res = await fetch(
      `${API_BASE}/channels/${config.channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Discord bot post failed (${res.status}): ${text}`);
      return "error";
    }
    return "posted";
  } catch (e) {
    console.error("Discord bot post threw:", e);
    return "error";
  }
}

export type RecentMessage = {
  authorId: string;
  authorUsername: string;
  authorIsBot: boolean;
  content: string;
  timestamp: string;
};

// Pulls recent messages from the configured channel for LLM context.
// Empty array = either bot not configured, fetch failed, or channel is empty;
// the caller proceeds without chat context.
export async function fetchRecentChannelMessages(
  limit = 50,
): Promise<RecentMessage[]> {
  const config = getBotConfig();
  if (!config) return [];
  try {
    const res = await fetch(
      `${API_BASE}/channels/${config.channelId}/messages?limit=${Math.min(limit, 100)}`,
      { headers: { Authorization: `Bot ${config.token}` } },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Discord fetch messages failed (${res.status}): ${text}`);
      return [];
    }
    const raw = (await res.json()) as Array<{
      author: { id: string; username: string; bot?: boolean };
      content: string;
      timestamp: string;
    }>;
    return raw.map((m) => ({
      authorId: m.author.id,
      authorUsername: m.author.username,
      authorIsBot: Boolean(m.author.bot),
      content: m.content,
      timestamp: m.timestamp,
    }));
  } catch (e) {
    console.error("Discord fetch messages threw:", e);
    return [];
  }
}

// Discord renders <@USER_ID> as a clickable mention that pings the user.
// Local-dev userIds (prefix "local-") aren't real Discord snowflakes — fall
// back to plain @text so the message still reads but nothing pings.
export function discordMention(
  userId: string,
  username: string | null,
): string {
  if (userId.startsWith("local-")) {
    return username ? `@${username}` : "@local-dev";
  }
  return `<@${userId}>`;
}

// Returns the userId only if it's a real Discord snowflake — used to build
// the `allowed_mentions.users` whitelist.
export function pingableUserId(userId: string): string | null {
  return userId.startsWith("local-") ? null : userId;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// LLM output references players as `@username` (cleaner prompt). Replace
// each `@username` with `<@userId>` so Discord renders it as a real ping.
// Word-boundary anchored so `@bob` doesn't match inside `@bobby`.
export function applyMentions(
  text: string,
  players: Array<{ userId: string; username: string | null }>,
): string {
  let out = text;
  for (const p of players) {
    if (!p.username) continue;
    if (p.userId.startsWith("local-")) continue;
    const re = new RegExp(`@${escapeRegex(p.username)}\\b`, "g");
    out = out.replace(re, `<@${p.userId}>`);
  }
  return out;
}

// Primary-style button. Click fires our /discord/interactions endpoint,
// which responds with LAUNCH_ACTIVITY (callback type 12).
export function playNowButton(): DiscordActionRow {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 1,
        label: "▸ Play Now",
        custom_id: "launch_activity",
      },
    ],
  };
}

export type PostResult = "posted" | "skipped-no-config" | "skipped-empty" | "error";

// Bot path is preferred; webhook is the fallback while envs migrate. The bot
// path includes the Play Now button (webhook URLs physically can't carry
// components). `mentionUserIds` whitelists exactly which `<@id>` tokens in
// the body are allowed to ping — anything not in the list renders as
// non-pinging text. Empty list = nothing pings.
export async function postWithFallback(
  content: string,
  mentionUserIds: string[],
  extraEmbeds?: DiscordEmbed[],
): Promise<PostResult> {
  if (!content.trim() && (!extraEmbeds || extraEmbeds.length === 0)) {
    return "skipped-empty";
  }

  const allowedMentions =
    mentionUserIds.length > 0
      ? { parse: [], users: mentionUserIds }
      : { parse: [] };

  const botResult = await postBotMessage({
    content: content || undefined,
    embeds: extraEmbeds,
    components: [playNowButton()],
    allowed_mentions: allowedMentions,
  });
  if (botResult === "posted") return "posted";
  if (botResult === "error") return "error";

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return "skipped-no-config";
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content || undefined,
        allowed_mentions: allowedMentions,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Discord webhook failed (${res.status}): ${text}`);
      return "error";
    }
    return "posted";
  } catch (e) {
    console.error("Discord webhook fetch threw:", e);
    return "error";
  }
}
