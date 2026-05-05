# Design

The visual system for Moviedle. Generated from the locked-in implementation in `activity/index.html`, `activity/src/index.css`, `activity/src/App.tsx` after the Lane C ("bootleg-zine") identity pass. Reference this file when adding any new surface so variants stay on-brand. Update it when tokens change.

## Theme

Light, with deliberate paper texture. The page is a zine page floating inside a (typically) dark Discord client; the contrast is intentional.

Scene sentence (verbatim from the design brief): *"A college film-club photocopying a stapled zine in 1996, slightly drunk and slightly mean — but the zine got scanned and posted on Are.na in 2026 and the post-internet kids are reblogging it."*

This forces the build to feel both **handmade** (slight rotations, hard ink shadows, riso-print color theory, photocopier grain) and **current** (real Tailwind v4 OKLCH tokens, real motion easing, real a11y). Neither pure nostalgia nor pure 2026-clean.

## Color palette

All defined in `activity/src/index.css` as Tailwind v4 `@theme` tokens, generating utilities like `bg-paper`, `text-ink`, `border-ink-soft`, `bg-pink`, etc.

| Role | Token | OKLCH | Use |
|---|---|---|---|
| Surface | `paper` | `oklch(0.97 0.012 85)` | Page background, card fills. Warm cream, not white. |
| Surface (sunk) | `paper-deep` | `oklch(0.93 0.018 85)` | Disabled fills, skeleton fills, secondary panels |
| Type primary | `ink` | `oklch(0.18 0.015 80)` | All primary text, all borders. Warm near-black, never `#000` |
| Type secondary | `ink-soft` | `oklch(0.42 0.015 80)` | Mono labels, supporting copy. AA on `paper` |
| Type tertiary | `ink-faint` | `oklch(0.5 0.015 80)` | Smallest mono metadata. AA on `paper` (calibrated) |
| Signal primary | `pink` | `oklch(0.68 0.22 5)` | Primary CTA fill, current-hint tag, focus ring, leaderboard score |
| Signal-soft | `pink-soft` | `oklch(0.92 0.06 5)` | Error toast bg, error-panel bg, ambient page glow |
| Signal secondary | `blue` | `oklch(0.56 0.22 250)` | Secondary CTA fill (e.g. Steal This Grid), leaderboard rank #2, scope toggle active |
| Signal-soft | `blue-soft` | `oklch(0.92 0.06 250)` | Secondary button hover, ambient page glow |
| Highlighter | `yellow` | `oklch(0.93 0.18 100)` | Stamps only (`[SOLVED]`, score badge, tape strips). ≤5% of any screen. |

Color strategy: **Full palette.** Four named signal roles, each used deliberately. Pink is the most saturated and carries primary-action affordance + the current-hint tag. Blue is the secondary affordance. Yellow is reserved for stamp-style highlights. Black/dark tones are always `ink`, never `#000`.

Body has an ambient gradient using `pink-soft` + `blue-soft` radial gradients (top-left + bottom-right) so the page is never a flat cream rectangle. Suppressed under `prefers-reduced-motion`.

### Forbidden in this system

- `#fff`, `#000`, or any pure-neutral gray.
- Emerald (the previous primary). Retired.
- Glassmorphism, gradient text, side-stripe accent borders. Same bans as the parent skill.
- Photographic backgrounds (movie posters, screenshots). The system is graphic.

## Typography

Three families, loaded from Google Fonts in `activity/index.html`.

| Token | Family | Use |
|---|---|---|
| `font-display` | **Boldonse** | The wordmark, section heads, the movie-title reveal. Chunky display face with character. |
| `font-sans` | **Inter** (400/500/600/700/800) | Body, hint content, button labels (when not all-caps mono) |
| `font-mono` | **JetBrains Mono** (400/500/700) | All-caps tags, dates, scores, countdowns, tertiary metadata. The "ticker" voice. |

### Scale

- Wordmark: `text-5xl` mobile / `text-6xl` desktop, `letterSpacing: -0.01em`. Display face.
- Section heads (`LEADERBOARD`, error titles, win-loss titles): `text-3xl` / `text-4xl` display.
- Body / hint content: `text-base` / `text-lg` Inter.
- Small caps tags & metadata: `text-[10px]`–`text-[11px]` mono, **always** with `uppercase tracking-[0.18em]`–`tracking-[0.22em]`. The wide-tracked caps are part of the voice.
- Numbers (score, countdown, leaderboard ranks): mono with `tabular-nums`.

Type contrast is real: jumps of 3–5x between display and small caps. Avoid mid-scale weights — the system is loud-or-quiet, not medium.

## Components

Every interactive element has explicit `default`, `hover`, `active`, `focus-visible`, `disabled`. Focus rings are 2px `pink` (or `blue`) offset 2px against `paper`.

### Cards

Default vocabulary across all card-shaped surfaces:
```
border-2 border-ink bg-paper p-4 sm:p-5
shadow-[5px_5px_0_var(--color-ink)]
[transform: rotate(-0.7deg–1.6deg)]   ← deterministic, see CARD_ROTATIONS
```
- **Hard ink shadow**, no soft drop shadows. The shadow is offset by the rotation direction so it reads as a stacked-on-paper effect.
- **No rounded corners.** Sharp 90° on every card. (Buttons can use `border-2` only without explicit radius — defaults to sharp.)
- **Slight rotation** (≤1.6°) is part of the identity. Never zero rotation on a focal element. Use the `CARD_ROTATIONS` array in `App.tsx` for deterministic seeding so cards don't reflow on re-render.

### Buttons

- **Primary CTA** (the one action you want the user to do): `bg-pink text-paper border-2 border-ink shadow-[4px_4px_0_var(--color-ink)]`. On `:active`: `translate-x-0.5 translate-y-0.5 shadow-[1px_1px_0_var(--color-ink)]` — chunky press feedback. `min-h-11` (44px tap target). Display-face label, uppercase, lg.
- **Secondary**: `bg-paper text-ink border-2 border-ink`, mono-caps label. Hover swaps to `bg-blue-soft`. Same `min-h-11`. Visually quieter — never matches primary in scale or color weight.
- **Tertiary / nav (tabs, scope toggle)**: small mono-caps with `border-2 border-ink`. Active state: filled with the role color (`pink` for tabs, `blue` for scope), `-translate-y-px`, hard ink shadow. Inactive: `bg-paper text-ink-soft`.
- **Disabled**: `bg-paper-deep text-ink-faint border-ink/40 shadow-none cursor-not-allowed`. Never lower opacity globally.

### Tags / Stamps

The system's signature element. `<StampTag>` in `App.tsx` is the canonical implementation.

Pattern: `border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em]`, rotated `-3°` to `+3°`, filled with `pink` / `blue` / `yellow` / `ink` depending on role:
- `pink` — current-hint label, leaderboard rank #3, "TODAY'S REEL"
- `blue` — leaderboard rank #2, "NO SCORES YET", scope toggle
- `yellow` — score-positive badge, "[ SOLVED ]" stamp, tape strips on win polaroid
- `ink` — "[ BUSTED ]" stamp on loss

Tags should always read like they were *applied* to the surface, not designed into it. Slight rotation + high-contrast border + mono-caps + tight tracking sells the effect.

### Inputs

- `border-2 border-ink bg-paper px-3 py-3 text-base`. No radius.
- Focus: 2px pink ring offset 2px.
- Disabled: `bg-paper-deep`.
- Tap target ≥ 44px.

### Result polaroids (win + loss)

Both built from the same chassis (`<WinScreen>` and `<LossScreen>` in `App.tsx`) but with deliberately different gestalts. **They must look different at thumbnail size.**

- **Win**: bg `paper`, rotation `+1.6°`, hard ink shadow `6px 6px 0`, **yellow tape strip** at top-right, **`[ SOLVED ]` rubber-stamp** in pink-on-yellow slammed across the top via `anim-stamp-slam`. Riso confetti dots animate up. Movie title in display face, ALL CAPS.
- **Loss**: bg `paper-deep` (sunken), rotation `-1.4°`, **no shadow** (sticker peeled), peeling-corner element top-right, **`[ BUSTED ]` stamp** in ink-on-paper at the top-left. No confetti. Same display-face title but reads quieter against the sunk surface.

### Skeletons

Solid `paper-deep` rectangles with `border-2 border-ink/40`. No spinner. No pulse. The grain texture provides the "alive" feel.

## Layout

- **No central capsule.** The shell is full-bleed paper with `mx-auto max-w-xl px-4 sm:px-8 py-6 sm:py-10`. Content runs edge-to-(comfortable)-edge. Header dominates.
- **Asymmetry is the default.** Cards rotate. Tags rotate. Buttons sit slightly off-grid. Symmetrical centered grids are the wrong instinct here.
- **Vertical rhythm**: `space-y-6` between major sections; `space-y-3` inside hint stacks; `space-y-4` inside result groups. Avoid uniform `space-y-2` — the rhythm should breathe at the section break and tighten inside groups.
- **Grain overlay** (`.grain` class, defined in `index.css`) applies an SVG-data-uri noise filter via `::after`. Apply to surface containers that should read as paper rather than a flat fill. Currently on `<Shell>`.

## Motion

All custom keyframes in `activity/src/index.css`. All decorative motion **must** opt out under `prefers-reduced-motion: reduce` (already wired).

| Animation | Use | Class | Duration | Easing |
|---|---|---|---|---|
| Stamp-down | New hint card revealed; error toast appearing | `anim-stamp-down` | 280ms | `--ease-stamp` (cubic-bezier(0.18, 0.9, 0.3, 1)) |
| Paper-tear | Wrong guess (replaces old shake) | `anim-tear` | 360ms | ease-in-out |
| Stamp-slam | `[ SOLVED ]` rubber-stamp on win | `anim-stamp-slam` | 420ms | `--ease-stamp` |
| Marquee blink | Live countdown numerals | `anim-marquee` | 1.6s loop | ease-in-out |
| Confetti burst | Riso-color dots on win | `confetti-burst` | 900ms | ease-out |

Press feedback on chunky buttons: `:active { translate(0.5, 0.5) }` paired with shadow shrink (`shadow-[1px_1px_0_...]`). No CSS transition on layout properties — `transform` only.

Banned: bounce, elastic, spring, fade-only entrances on focal elements, page-load orchestration sequences.

## Accessibility

- **Floor**: WCAG AA. 4.5:1 for body text, 3:1 for large text. Calibrated: `ink` is AAA on `paper`; `ink-soft` is AA-comfortable; `ink-faint` is AA-floor (use only for `text-[10px]`–`text-[11px]` metadata).
- **Color is never the only signal.** Grid uses `█▓▒░` glyphs that read in monochrome. Stamps carry shape + caps + rotation, not just hue. Leaderboard medals use rank-number + tape-rotation + color.
- **Focus visible** on every interactive element. 2px ring in role color (`pink` for primary nav/inputs, `blue` for secondary nav). Offset 2px against `paper`.
- **Tap targets** ≥ 44px (`min-h-11`) on every primary tap target. Tabs and scope toggles slightly smaller (~30px) but spaced.
- **Reduced motion** kills all decorative animations and the body gradient. Tested in `index.css:reduced-motion` block.
- **Live regions**: `aria-live="polite"` on hint stack and result, `aria-live="assertive"` on error toast.

## Voice

Owned by copy, not by visuals — but the visual system has to support it. Caps + mono = the dry, in-on-the-joke ticker voice. Display face + hand-pasted rotation = the friend made it.

On-tone copy examples actually shipped:
- `WHICH MOVIE? TYPE IT.` (input label)
- `BURN A HINT` (secondary CTA, replacing "Reveal next")
- `STEAL THIS GRID` (share CTA, replacing "Share result")
- `OUT OF REEL · TRY TOMORROW` (loss line)
- `[ SOLVED ]` / `[ BUSTED ]` (result stamps)
- `NEXT REEL IN 12:34:56` (countdown)
- `WRONG GUESSES BURN THE NEXT HINT TOO. 5 WRONG = BUSTED.` (rules footnote)

If new copy reads like *"Welcome to your movie journey"* or *"Oops! Try again 😊"*, it has failed and needs a rewrite before ship.
