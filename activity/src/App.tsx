import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useDiscord } from "./hooks/useDiscord";

type GridCell = "correct" | "wrong" | "revealed" | "unseen";

const CELL_GLYPH: Record<GridCell, string> = {
  correct: "█",
  wrong: "▓",
  revealed: "▒",
  unseen: "░",
};

const HINT_LABEL: Record<string, string> = {
  emoji: "VIBE",
  setting: "SETTING",
  famous_quote: "QUOTE",
  trivia: "TRIVIA",
  cast_clue: "CAST",
  crew_clue: "CREW",
  plot_summary: "PLOT",
  fake_review: "REVIEW",
  object_list: "OBJECTS",
  tagline: "TAGLINE",
  first_or_last_line: "OPENING",
  soundtrack: "SOUNDTRACK",
};

// Deterministic small rotations so cards look hand-pasted, not RNG-jumpy
// across renders. Indexed by hint order; cycles past 5.
const CARD_ROTATIONS = ["-0.7deg", "0.5deg", "-0.4deg", "0.8deg", "-0.6deg"];

type Tab = "today" | "leaderboard";

export default function App() {
  const discord = useDiscord();
  const [tab, setTab] = useState<Tab>("today");

  if (discord.status === "loading") {
    return (
      <Shell>
        <div className="space-y-6">
          <HeaderSkeleton />
          <p
            className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft"
            role="status"
          >
            [ CUEING THE REEL… ]
          </p>
          <SkeletonHintStack count={1} />
        </div>
      </Shell>
    );
  }
  if (discord.status === "error") {
    return (
      <Shell>
        <ErrorPanel
          title="BAD REEL."
          message={discord.error.message}
          hint="Refresh and try again. Ping the dev if it keeps happening."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <Tabs value={tab} onChange={setTab} />
      {tab === "today" ? (
        <Game
          userId={discord.ctx.userId}
          guildId={discord.ctx.guildId ?? undefined}
          username={discord.ctx.username}
        />
      ) : (
        <Leaderboard guildId={discord.ctx.guildId ?? undefined} />
      )}
    </Shell>
  );
}

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Moviedle sections"
      className="mb-5 flex gap-2"
    >
      <TabTag
        active={value === "today"}
        onClick={() => onChange("today")}
        label="TODAY"
        accent="pink"
      />
      <TabTag
        active={value === "leaderboard"}
        onClick={() => onChange("leaderboard")}
        label="LEADERBOARD"
        accent="blue"
      />
    </div>
  );
}

function TabTag({
  active,
  onClick,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  accent: "pink" | "blue";
}) {
  const accentBg = accent === "pink" ? "bg-pink" : "bg-blue";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "font-mono text-[11px] font-bold uppercase tracking-[0.18em] " +
        "border-2 border-ink px-3 py-1.5 transition " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-pink focus-visible:ring-offset-2 focus-visible:ring-offset-paper " +
        (active
          ? `${accentBg} text-paper shadow-[3px_3px_0_var(--color-ink)] -translate-y-px`
          : "bg-paper text-ink-soft hover:text-ink hover:bg-paper-deep")
      }
    >
      {label}
    </button>
  );
}

function Game({
  userId,
  guildId,
  username,
}: {
  userId: string;
  guildId: string | undefined;
  username: string | null;
}) {
  const puzzle = useQuery(api.game.getTodaysPuzzle, { userId });
  const attempt = useQuery(api.game.getTodaysAttempt, { userId });
  const submitGuess = useMutation(api.game.submitGuess);
  const revealHint = useMutation(api.game.revealHint);
  const touchUsername = useMutation(api.game.touchUsername);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  // Refresh the persisted username whenever the activity loads. Handles
  // player docs created before username threading existed and Discord
  // username changes. Best-effort; failures are silent.
  useEffect(() => {
    if (!username) return;
    void touchUsername({ userId, username }).catch(() => {});
  }, [touchUsername, userId, username]);

  const dismissError = () => setError(null);

  if (puzzle === undefined || attempt === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <HeaderSkeleton />
        <SkeletonHintStack count={1} />
        <SkeletonInput />
      </div>
    );
  }
  if (puzzle === null) {
    return <EmptyPuzzle username={username} />;
  }

  const done = !!attempt?.guessed;
  const prevWrong = (attempt?.grid ?? []).filter((c) => c === "wrong").length;
  const revealedCount = attempt?.hintsRevealed ?? 1;
  const reelNumber = puzzle.date.replaceAll("-", "");
  const sequelChallenge = attempt?.sequelChallenge;
  const challengeActive = !!sequelChallenge && !sequelChallenge.used;

  return (
    <div className="space-y-6">
      <Header
        date={puzzle.date}
        reel={reelNumber}
        username={username}
        attempt={attempt}
      />

      <ErrorToast message={error} onDismiss={dismissError} />

      <HintStack
        hints={puzzle.hints}
        revealedCount={revealedCount}
      />

      {done ? (
        <ResultScreen
          attempt={attempt!}
          movieTitle={puzzle.movieTitle ?? "(unknown)"}
          puzzleDate={puzzle.date}
          hints={puzzle.hints}
        />
      ) : (
        <ActiveControls
          totalHints={puzzle.totalHints}
          hintsRevealed={revealedCount}
          shakeKey={shakeKey}
          onGuess={async (guess) => {
            try {
              const result = await submitGuess({
                userId,
                guildId,
                username: username ?? undefined,
                guess,
              });
              if (result.status === "wrong") {
                setShakeKey((k) => k + 1);
              }
              setError(null);
            } catch (e) {
              setError(humanizeError(e));
            }
          }}
          onReveal={async () => {
            try {
              await revealHint({ userId, guildId });
              setError(null);
            } catch (e) {
              setError(humanizeError(e));
            }
          }}
          prevWrong={prevWrong}
          challengeActive={challengeActive}
          challengeBaseGuess={sequelChallenge?.baseGuess ?? null}
        />
      )}
    </div>
  );
}

function humanizeError(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^.*?Error:\s*/, "");
  return "Something went sideways. Try again.";
}

function ErrorToast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  // Persistent until dismissed or hover-paused. Auto-dismiss after 8s
  // unless the user is hovering. Replaces the old fire-and-forget 4.5s.
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!message || hovered) return;
    const id = setTimeout(onDismiss, 8000);
    return () => clearTimeout(id);
  }, [message, onDismiss, hovered]);
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="anim-stamp-down flex items-start gap-2 border-2 border-ink bg-pink-soft px-3 py-2 text-sm text-ink shadow-[3px_3px_0_var(--color-ink)]"
      style={{ ["--stamp-rot" as string]: "-0.6deg" }}
    >
      <span aria-hidden="true" className="font-mono font-bold text-pink">
        ✕
      </span>
      <p className="flex-1 wrap-break-word font-medium">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded-none border border-ink/40 px-1 font-mono text-xs text-ink hover:bg-ink hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        DISMISS
      </button>
    </div>
  );
}

function EmptyPuzzle({ username }: { username: string | null }) {
  return (
    <div
      className="border-2 border-ink bg-paper p-6 text-center shadow-[6px_6px_0_var(--color-ink)]"
      style={{ transform: "rotate(-0.6deg)" }}
    >
      <StampTag color="pink" angle="-4deg" className="mb-4 inline-block">
        TODAY&apos;S REEL
      </StampTag>
      <h2 className="font-display text-3xl leading-tight text-ink">
        ISN&apos;T LOADED YET
      </h2>
      <p className="mt-3 text-sm text-ink-soft">
        {username ? `${username}, ` : ""}check back in a min and refresh.
      </p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        NEW REELS DROP DAILY AT 00:00 UTC
      </p>
    </div>
  );
}

function ErrorPanel({
  title,
  message,
  hint,
}: {
  title: string;
  message: string;
  hint?: string;
}) {
  return (
    <div
      role="alert"
      className="border-2 border-ink bg-pink-soft p-5 text-center shadow-[5px_5px_0_var(--color-ink)]"
      style={{ transform: "rotate(0.4deg)" }}
    >
      <p
        className="mb-2 inline-block border-2 border-ink bg-pink px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper"
        style={{ transform: "rotate(-3deg)" }}
      >
        {title}
      </p>
      <p className="mt-2 wrap-break-word text-sm text-ink">{message}</p>
      {hint && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}

function StampTag({
  children,
  color = "pink",
  angle = "-3deg",
  className = "",
}: {
  children: React.ReactNode;
  color?: "pink" | "blue" | "yellow" | "ink";
  angle?: string;
  className?: string;
}) {
  const palette: Record<string, string> = {
    pink: "bg-pink text-paper border-ink",
    blue: "bg-blue text-paper border-ink",
    yellow: "bg-yellow text-ink border-ink",
    ink: "bg-ink text-paper border-ink",
  };
  return (
    <span
      className={
        "border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] " +
        palette[color] +
        " " +
        className
      }
      style={{ transform: `rotate(${angle})`, display: "inline-block" }}
    >
      {children}
    </span>
  );
}

function HeaderSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="h-12 w-48 bg-paper-deep" />
      <div className="h-3 w-32 bg-paper-deep" />
    </div>
  );
}

function SkeletonHintStack({ count }: { count: number }) {
  return (
    <ol className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="border-2 border-ink/40 bg-paper-deep p-4"
        >
          <div className="mb-3 h-3 w-20 bg-paper" />
          <div className="h-6 w-3/4 bg-paper" />
        </li>
      ))}
    </ol>
  );
}

function SkeletonInput() {
  return (
    <div aria-hidden="true" className="space-y-2">
      <div className="h-11 w-full border-2 border-ink/40 bg-paper-deep" />
      <div className="flex gap-2">
        <div className="h-11 flex-1 border-2 border-ink/40 bg-paper-deep" />
        <div className="h-11 w-28 border-2 border-ink/40 bg-paper-deep" />
      </div>
    </div>
  );
}

function Header({
  date,
  reel,
  username,
  attempt,
}: {
  date: string;
  reel: string;
  username: string | null;
  attempt: { score: number; guessed: boolean } | null | undefined;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1
          className="font-display text-5xl leading-[0.9] text-ink sm:text-6xl"
          style={{ letterSpacing: "-0.01em" }}
        >
          MOVIEDLE
        </h1>
        <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ink-soft">
          <span className="text-ink">{formatHeaderDate(date)}</span>
          <span className="mx-2 text-ink-faint">//</span>
          <span>REEL #{reel}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        {username && (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            @{username}
          </p>
        )}
        {attempt?.guessed && (
          <ScoreStamp score={attempt.score} className="mt-1" />
        )}
      </div>
    </header>
  );
}

function ScoreStamp({
  score,
  className = "",
}: {
  score: number;
  className?: string;
}) {
  const positive = score > 0;
  return (
    <span
      className={
        "inline-block border-2 border-ink px-2 py-0.5 font-mono text-sm font-bold tabular-nums " +
        (positive ? "bg-yellow text-ink" : "bg-paper-deep text-ink-soft") +
        " " +
        className
      }
      style={{ transform: "rotate(2deg)" }}
    >
      {positive ? `+${score}` : "0 PTS"}
    </span>
  );
}

function HintStack({
  hints,
  revealedCount,
}: {
  hints: Array<{ type: string; content: string; order: number }>;
  revealedCount: number;
}) {
  const sorted = useMemo(
    () => [...hints].sort((a, b) => a.order - b.order),
    [hints],
  );
  return (
    <ol className="space-y-3" aria-live="polite">
      {sorted.map((h) => {
        const isCurrent = h.order === revealedCount;
        return (
          <li key={h.order}>
            {isCurrent ? (
              <CurrentHint hint={h} />
            ) : (
              <PreviousHint hint={h} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function CurrentHint({
  hint,
}: {
  hint: { type: string; content: string; order: number };
}) {
  const rot = CARD_ROTATIONS[(hint.order - 1) % CARD_ROTATIONS.length];
  return (
    <div
      className="anim-stamp-down relative border-2 border-ink bg-paper p-4 pt-7 shadow-[5px_5px_0_var(--color-ink)] sm:p-5 sm:pt-8"
      style={{ ["--stamp-rot" as string]: rot, transform: `rotate(${rot})` }}
    >
      <span
        className="absolute -top-3 left-3 inline-block border-2 border-ink bg-pink px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-paper shadow-[2px_2px_0_var(--color-ink)]"
        style={{ transform: "rotate(-2deg)" }}
      >
        HINT {hint.order} // {HINT_LABEL[hint.type] ?? hint.type.toUpperCase()}
      </span>
      <p
        className={
          hint.type === "emoji"
            ? "py-2 text-center text-4xl tracking-[0.3em] leading-none"
            : "text-base leading-snug text-ink sm:text-lg"
        }
      >
        {hint.content}
      </p>
    </div>
  );
}

function PreviousHint({
  hint,
}: {
  hint: { type: string; content: string; order: number };
}) {
  const rot = CARD_ROTATIONS[(hint.order - 1) % CARD_ROTATIONS.length];
  return (
    <div
      className="border-l-[3px] border-ink/40 bg-paper-deep/60 px-3 py-2 opacity-80"
      style={{ transform: `rotate(${rot})` }}
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-soft">
        {hint.order} · {HINT_LABEL[hint.type] ?? hint.type.toUpperCase()}
      </p>
      <p
        className={
          hint.type === "emoji"
            ? "text-2xl tracking-[0.25em] leading-none text-ink-soft"
            : "mt-0.5 text-[13px] leading-snug text-ink-soft"
        }
      >
        {hint.content}
      </p>
    </div>
  );
}

function ActiveControls({
  totalHints,
  hintsRevealed,
  shakeKey,
  onGuess,
  onReveal,
  prevWrong,
  challengeActive,
  challengeBaseGuess,
}: {
  totalHints: number;
  hintsRevealed: number;
  shakeKey: number;
  onGuess: (guess: string) => Promise<void>;
  onReveal: () => Promise<void>;
  prevWrong: number;
  challengeActive: boolean;
  challengeBaseGuess: string | null;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canReveal = hintsRevealed < totalHints;

  // Refocus input after a wrong-guess shake so the player can type again.
  useEffect(() => {
    if (shakeKey > 0) inputRef.current?.focus();
  }, [shakeKey]);

  const submit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onGuess(trimmed);
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={"space-y-3 " + (shakeKey > 0 ? "anim-tear" : "")}
      key={shakeKey}
    >
      {challengeActive && (
        <NearMissBanner baseGuess={challengeBaseGuess} />
      )}
      <label
        htmlFor="moviedle-guess"
        className="block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ink-soft"
      >
        {challengeActive ? "WHICH ONE IN THE SERIES?" : "WHICH MOVIE? TYPE IT."}
      </label>
      <input
        id="moviedle-guess"
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={
          challengeActive
            ? "e.g. avengers 2"
            : "e.g. everything everywhere all at once"
        }
        autoFocus
        disabled={busy}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        className="w-full border-2 border-ink bg-paper px-3 py-3 text-base text-ink placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-pink focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:bg-paper-deep"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className={
            "min-h-11 flex-1 border-2 border-ink bg-pink px-4 py-3 font-display text-lg uppercase tracking-wide text-paper " +
            "shadow-[4px_4px_0_var(--color-ink)] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--color-ink)] " +
            "hover:bg-[oklch(0.62_0.22_5)] disabled:cursor-not-allowed disabled:bg-paper-deep disabled:text-ink-faint disabled:shadow-none " +
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          }
        >
          {busy
            ? "STAMPING…"
            : challengeActive
              ? "LOCK IT IN"
              : `GUESS · ${hintsRevealed}/${totalHints}`}
        </button>
        <button
          type="button"
          disabled={busy || !canReveal}
          onClick={async () => {
            setBusy(true);
            try {
              await onReveal();
            } finally {
              setBusy(false);
            }
          }}
          className={
            "min-h-11 self-stretch border-2 border-ink bg-paper px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink " +
            "transition hover:bg-blue-soft active:translate-x-0.5 active:translate-y-0.5 " +
            "disabled:cursor-not-allowed disabled:border-ink/40 disabled:text-ink-faint " +
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          }
        >
          BURN A HINT
        </button>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
        {challengeActive
          ? "MISS THIS ONE AND I BURN THE NEXT HINT."
          : "WRONG GUESSES BURN THE NEXT HINT TOO. 5 WRONG = BUSTED."}
        {prevWrong > 0 && !challengeActive && (
          <span className="ml-2 font-bold text-pink">
            {prevWrong} WRONG SO FAR.
          </span>
        )}
      </p>
    </form>
  );
}

function NearMissBanner({ baseGuess }: { baseGuess: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="anim-stamp-down relative border-2 border-ink bg-yellow px-3 py-2 pr-4 shadow-[3px_3px_0_var(--color-ink)]"
      style={{ ["--stamp-rot" as string]: "-0.6deg" }}
    >
      <span
        className="absolute -top-2 left-3 inline-block border-2 border-ink bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-paper"
        style={{ transform: "rotate(-3deg)" }}
      >
        NEAR MISS
      </span>
      <p className="mt-2 text-sm font-medium leading-snug text-ink">
        {baseGuess ? (
          <>
            you got <span className="font-bold">{baseGuess.toUpperCase()}</span>{" "}
            — but which one?{" "}
          </>
        ) : (
          <>you got the title — but which one in the series?{" "}</>
        )}
        <span className="font-mono text-[12px] text-ink-soft">
          1, 2, 3…? free retry — miss and the hint burns.
        </span>
      </p>
    </div>
  );
}

function ResultScreen({
  attempt,
  movieTitle,
  puzzleDate,
  hints,
}: {
  attempt: { correct: boolean; score: number; grid: GridCell[] };
  movieTitle: string;
  puzzleDate: string;
  hints: Array<{ type: string; content: string; order: number }>;
}) {
  const [copied, setCopied] = useState(false);

  const correctIdx = attempt.grid.findIndex((c) => c === "correct");
  const guessedOnLevel = attempt.correct ? correctIdx + 1 : 0;
  const solvedHintType = useMemo(() => {
    if (!attempt.correct) return null;
    const sorted = [...hints].sort((a, b) => a.order - b.order);
    const h = sorted[correctIdx];
    if (!h) return null;
    return HINT_LABEL[h.type] ?? h.type.toUpperCase();
  }, [hints, correctIdx, attempt.correct]);

  const bar = `[${attempt.grid.map((c) => CELL_GLYPH[c]).join("")}]`;
  const scoreLine = attempt.correct ? `${guessedOnLevel}/5` : "X/5";
  const tail = attempt.correct
    ? `solved on ${solvedHintType ?? "?"}`
    : `busted on 5`;
  const shareText = `MOVIEDLE // ${puzzleDate} // ${scoreLine}\n${bar} ${tail}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Best-effort: clipboard may be unavailable in iframe.
    }
  };

  return attempt.correct ? (
    <WinScreen
      attempt={attempt}
      movieTitle={movieTitle}
      guessedOnLevel={guessedOnLevel}
      solvedHintType={solvedHintType}
      bar={bar}
      copied={copied}
      onCopy={copy}
    />
  ) : (
    <LossScreen
      movieTitle={movieTitle}
      bar={bar}
      copied={copied}
      onCopy={copy}
    />
  );
}

function WinScreen({
  attempt,
  movieTitle,
  guessedOnLevel,
  solvedHintType,
  bar,
  copied,
  onCopy,
}: {
  attempt: { score: number };
  movieTitle: string;
  guessedOnLevel: number;
  solvedHintType: string | null;
  bar: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-4" aria-live="polite">
      <div
        className="anim-stamp-down relative border-2 border-ink bg-paper p-5 pt-6 shadow-[6px_6px_0_var(--color-ink)] sm:p-6 sm:pt-8"
        style={{
          ["--stamp-rot" as string]: "1.6deg",
          transform: "rotate(1.6deg)",
        }}
      >
        <Confetti />
        {/* SOLVED rubber-stamp slammed across the top corner */}
        <span
          aria-hidden="true"
          className="anim-stamp-slam pointer-events-none absolute left-1/2 top-3 z-10 inline-block border-[3px] border-pink bg-yellow/90 px-3 py-1 font-mono text-base font-bold uppercase tracking-[0.3em] text-pink"
          style={{
            ["--stamp-angle" as string]: "-7deg",
          }}
        >
          [ SOLVED ]
        </span>

        {/* Tape strip pinning the polaroid */}
        <span
          aria-hidden="true"
          className="absolute -top-2 right-6 h-3 w-16 border-2 border-ink bg-yellow"
          style={{ transform: "rotate(-8deg)" }}
        />

        <div className="mt-6 space-y-3 text-center">
          <p className="font-mono text-2xl tracking-[0.18em] text-ink sm:text-3xl">
            {bar}
          </p>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-ink-soft">
            SOLVED ON {guessedOnLevel}
            {solvedHintType ? (
              <>
                <span className="mx-2 text-ink-faint">·</span>
                <span className="text-pink">{solvedHintType}</span>
              </>
            ) : null}
            <span className="mx-2 text-ink-faint">·</span>
            <span className="text-ink">+{attempt.score}</span>
          </p>
          <p
            className="font-display text-2xl leading-tight text-ink sm:text-3xl"
            style={{ letterSpacing: "-0.01em" }}
          >
            {movieTitle.toUpperCase()}
          </p>
        </div>
      </div>

      <ResultActions copied={copied} onCopy={onCopy} />
      <Countdown />
    </div>
  );
}

function LossScreen({
  movieTitle,
  bar,
  copied,
  onCopy,
}: {
  movieTitle: string;
  bar: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-4" aria-live="polite">
      <div
        className="relative border-2 border-ink bg-paper-deep p-5 sm:p-6"
        style={{ transform: "rotate(-1.4deg)" }}
      >
        {/* Peeling sticker corner */}
        <span
          aria-hidden="true"
          className="absolute right-0 top-0 h-10 w-10 border-2 border-ink/60 bg-paper"
          style={{
            transform: "rotate(8deg) translate(8px, -8px)",
            transformOrigin: "top right",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute left-3 top-3 inline-block border-2 border-ink bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-paper"
          style={{ transform: "rotate(-4deg)" }}
        >
          [ BUSTED ]
        </span>

        <div className="mt-6 space-y-3 text-center">
          <p className="font-mono text-2xl tracking-[0.18em] text-ink-soft sm:text-3xl">
            {bar}
          </p>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-ink-soft">
            OUT OF REEL · TRY TOMORROW
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            THE MOVIE WAS
          </p>
          <p
            className="font-display text-2xl leading-tight text-ink sm:text-3xl"
            style={{ letterSpacing: "-0.01em" }}
          >
            {movieTitle.toUpperCase()}
          </p>
        </div>
      </div>

      <ResultActions copied={copied} onCopy={onCopy} />
      <Countdown />
    </div>
  );
}

function ResultActions({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      onClick={onCopy}
      className={
        "block w-full border-2 border-ink bg-blue px-4 py-3 font-display text-lg uppercase tracking-wide text-paper " +
        "shadow-[4px_4px_0_var(--color-ink)] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--color-ink)] " +
        "hover:bg-[oklch(0.5_0.22_250)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      }
      aria-live="polite"
    >
      {copied ? "COPIED · POST IT" : "STEAL THIS GRID"}
    </button>
  );
}

function Confetti() {
  const dots = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => {
      const angle = (Math.PI * (i + 1)) / 9;
      const x = Math.cos(angle) * 70;
      const y = -Math.sin(angle) * 70 - 24;
      // Riso-coded palette: pink, blue, yellow, ink, repeated.
      const palette = [
        "oklch(0.68 0.22 5)",
        "oklch(0.56 0.22 250)",
        "oklch(0.93 0.18 100)",
        "oklch(0.18 0.015 80)",
      ];
      return {
        end: `translate(${x}px, ${y}px)`,
        delay: `${i * 35}ms`,
        color: palette[i % palette.length],
      };
    });
  }, []);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"
    >
      <div className="relative h-1 w-1">
        {dots.map((d, i) => (
          <span
            key={i}
            className="confetti-dot"
            style={
              {
                background: d.color,
                "--confetti-end": d.end,
                "--confetti-delay": d.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

function Countdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = useMemo(() => msUntilNextUtcMidnight(now), [now]);
  return (
    <p className="text-center font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-ink-soft">
      NEXT REEL IN{" "}
      <span className="anim-marquee text-ink">
        {formatDuration(remaining)}
      </span>
    </p>
  );
}

function Leaderboard({ guildId }: { guildId: string | undefined }) {
  const [scope, setScope] = useState<"global" | "server">(
    guildId ? "server" : "global",
  );
  const effectiveGuildId = scope === "server" ? guildId : undefined;
  const rows = useQuery(api.leaderboard.getLeaderboard, {
    guildId: effectiveGuildId,
    limit: 10,
  });

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-2">
        <h2
          className="font-display text-3xl leading-none text-ink sm:text-4xl"
          style={{ letterSpacing: "-0.01em" }}
        >
          LEADERBOARD
        </h2>
        {guildId && (
          <div
            role="tablist"
            aria-label="Leaderboard scope"
            className="inline-flex gap-1.5"
          >
            <ScopeButton
              active={scope === "server"}
              onClick={() => setScope("server")}
              label="SERVER"
            />
            <ScopeButton
              active={scope === "global"}
              onClick={() => setScope("global")}
              label="GLOBAL"
            />
          </div>
        )}
      </header>

      {rows === undefined ? (
        <SkeletonLeaderboard />
      ) : rows.length === 0 ? (
        <div
          className="border-2 border-ink bg-paper p-6 text-center shadow-[5px_5px_0_var(--color-ink)]"
          style={{ transform: "rotate(0.5deg)" }}
        >
          <StampTag color="blue" angle="-3deg" className="mb-3 inline-block">
            NO SCORES YET
          </StampTag>
          <p className="font-display text-2xl leading-tight text-ink">
            BE THE FIRST IN THE REEL.
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            GO SOLVE TODAY&apos;S PUZZLE
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <LeaderboardColumnHeader />
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <LeaderboardRow key={r.userId} row={r} rank={i + 1} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function LeaderboardColumnHeader() {
  return (
    <div
      className="flex items-center gap-3 px-3 pb-1 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-ink-soft"
      aria-hidden="true"
    >
      <span className="h-7 w-9 shrink-0" />
      <span className="flex-1" />
      <span className="w-14 shrink-0 text-right">STREAK</span>
      <span className="w-14 shrink-0 text-right">POINTS</span>
    </div>
  );
}

function LeaderboardRow({
  row,
  rank,
}: {
  row: {
    userId: string;
    username?: string | null;
    totalScore: number;
    currentStreak: number;
    gamesPlayed: number;
  };
  rank: number;
}) {
  const isMedal = rank <= 3;
  const medalAccent =
    rank === 1
      ? "bg-yellow text-ink"
      : rank === 2
        ? "bg-blue text-paper"
        : rank === 3
          ? "bg-pink text-paper"
          : "bg-paper text-ink-soft";
  return (
    <li
      className={
        "flex items-center gap-3 border-2 px-3 py-2.5 transition " +
        (isMedal
          ? "border-ink bg-paper shadow-[3px_3px_0_var(--color-ink)]"
          : "border-ink/50 bg-paper/70")
      }
    >
      <span
        className={
          "inline-flex h-7 w-9 shrink-0 items-center justify-center border-2 border-ink font-mono text-sm font-bold tabular-nums " +
          medalAccent
        }
        style={{ transform: isMedal ? "rotate(-3deg)" : undefined }}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>
      <span className="flex-1 truncate text-sm font-medium text-ink">
        {row.username ? `@${row.username}` : shortId(row.userId)}
      </span>
      <span
        className="w-14 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-ink-soft"
        title={`${row.gamesPlayed} games played`}
      >
        🔥 {row.currentStreak}
      </span>
      <span
        className="w-14 shrink-0 text-right font-mono text-base font-bold tabular-nums text-pink"
        title="Total points"
      >
        {row.totalScore.toLocaleString("en-US")}
      </span>
    </li>
  );
}

function ScopeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "border-2 border-ink px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] transition " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper " +
        (active
          ? "bg-blue text-paper shadow-[2px_2px_0_var(--color-ink)] -translate-y-px"
          : "bg-paper text-ink-soft hover:text-ink hover:bg-paper-deep")
      }
    >
      {label}
    </button>
  );
}

function SkeletonLeaderboard() {
  return (
    <ol className="space-y-2" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-2 border-ink/40 bg-paper-deep px-3 py-2.5"
        >
          <div className="h-6 w-9 bg-paper" />
          <div className="h-3 flex-1 bg-paper" />
          <div className="h-3 w-12 bg-paper" />
        </li>
      ))}
    </ol>
  );
}

function shortId(id: string): string {
  if (id.startsWith("local-")) return "local-dev";
  return id.length > 8 ? `…${id.slice(-6)}` : id;
}

function formatHeaderDate(date: string): string {
  // YYYY-MM-DD → "MAY 04 2026"
  const [y, m, d] = date.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return date;
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const mm = months[m - 1] ?? "???";
  return `${mm} ${d.toString().padStart(2, "0")} ${y}`;
}

function msUntilNextUtcMidnight(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
  );
  return Math.max(0, next - now);
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grain min-h-dvh bg-paper">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-8 sm:py-10">
        {children}
      </div>
    </main>
  );
}
