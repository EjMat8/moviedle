import { useEffect, useState } from "react";
import { getDiscordContext, type DiscordContext } from "../lib/discord";

type State =
  | { status: "loading" }
  | { status: "ready"; ctx: DiscordContext }
  | { status: "error"; error: Error };

export function useDiscord(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getDiscordContext()
      .then((ctx) => {
        if (!cancelled) setState({ status: "ready", ctx });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // Discord SDK rejects with plain objects (e.g. {code, message}),
          // not Error instances. String(err) gives "[object Object]" on those,
          // so unwrap meaningful fields manually before falling back.
          console.error("Discord context init failed:", err);
          setState({ status: "error", error: toError(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  if (err && typeof err === "object") {
    const obj = err as { message?: unknown; code?: unknown };
    const message =
      typeof obj.message === "string" && obj.message.length > 0
        ? obj.message
        : safeStringify(err);
    const wrapped = new Error(message);
    if (obj.code !== undefined) (wrapped as Error & { code?: unknown }).code = obj.code;
    return wrapped;
  }
  return new Error(String(err));
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
