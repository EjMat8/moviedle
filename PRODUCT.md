# Product

## Register

product

## Users

A Gen Z friend group hanging out in a Discord voice channel. Phone-in-hand or second-monitor on desktop. They open Moviedle as a shared 30-second daily ritual — guess the movie, talk shit about each other's scores, share the grid in chat, move on. The job-to-be-done is *"give us a daily moment to compete and roast each other,"* not *"teach me about movies."*

Context that shapes the UI:
- Glanceable. Played mid-conversation, not in deep focus.
- Mobile-first viewport (Discord Activity iframe, often portrait on phone).
- Read-aloud-friendly — one player often reads hints out loud to the room.
- Pool skews 2015+ (their lifetime); older films only iconic-tier.

## Product Purpose

Daily movie-guessing game embedded in Discord. Five escalating hints (L1 abstract emoji → L5 director + supporting context). Wrong guesses also reveal. Score + streak + shareable Wordle-grid + per-server / global leaderboard. Success = the friend group plays it every day without being told to, and the grid gets posted in chat.

This is a friend-group ritual generator. Not a movie-discovery tool, not a cinephile credentialing system, not a single-player puzzle.

## Brand Personality

**Cool, modern, fun** — translated into operational principles below, because those words alone don't steer design choices.

- **Cool** = restraint and craft. Confident type, deliberate negative space, no decorative noise. The opposite of *"AI slop dashboard."* You can tell a person made it.
- **Modern** = current visual idioms used with taste, not chased. OKLCH color, real motion, real type system. No 2018 SaaS-cream, no 2014 flat-iOS, no neon-Discord-bot cliché.
- **Fun** = personality leaks through in copy, motion, and small reveals — not in clip-art mascots or emoji-confetti. Fun is the *texture* of the interaction, not a sticker on top of it.

Tone of voice: dry, slightly cocky, in on the joke. Closer to a group chat than to a product. Examples on-tone: *"Out of hints — better luck tomorrow."* / *"Wrong guesses also reveal the next hint. 5 wrong = 0 pts."* Examples off-tone: *"Oops! Try again 😊"* / *"Welcome to your Movie Journey."*

## Anti-references

The user's direct words: *"no boring generic AI-slop dashboards or sites, no mediocre, no average."* Treat this as the primary acceptance test.

Specific bans:
- **Generic dark SaaS dashboard** — zinc/slate cards in a grid, hero-metric template, side nav with icons. *(Risk: the current build is closest to this; the critique should call it out.)*
- **AI-slop quiz/trivia app** — bright hero gradient, big rounded card, friendly mascot, bouncy motion, *"Let's play!"* tone.
- **Letterboxd-sincere cinephile reverence** — sepia, serif headers, deferential film-school tone. Wrong audience.
- **NYT-Wordle newspaper-clean** — flat sans, tons of whitespace, broadsheet hush. We're a Discord activity, not a coffee-table puzzle.
- **Neon-Discord-bot cliché** — purple-on-black gradients, glowing borders, "premium tier" energy.
- **Movie-poster collage backgrounds** — chaos, IP-licensing trap, distracts from the puzzle.

If the design could plausibly ship with *any other product name swapped in,* it has failed the AI-slop test.

## Design Principles

1. **Make a person's choice visible.** Every screen should have at least one decision that a generic AI generator wouldn't make: a typographic move, a motion choice, a copy line, a color commitment. If you can't point to it, push harder.
2. **Built for the side-monitor glance.** Players are mid-conversation. The next action and the current state must be readable in a 1-second glance. No hunting.
3. **Roastable, not earnest.** Copy and reveals should fit a group chat where people make fun of each other. Avoid encouragement-software warmth.
4. **The grid is the artifact.** The shareable result is the product's viral surface. It should look distinctive — emoji-grid is fine, but the surrounding share moment must not feel like every other Wordle clone.
5. **Restraint over decoration.** Motion, color, and ornament earn their place by serving the moment (hint reveal, wrong guess, win). Idle decoration = AI slop.

## Accessibility & Inclusion

- **WCAG AA** as the floor: 4.5:1 contrast for text, keyboard navigation, visible focus indicators, screen-reader labels.
- **Reduced motion respected.** All decorative motion (reveal, shake, pop, confetti, pulse) must short-circuit under `prefers-reduced-motion: reduce`. Already wired in `index.css` — keep it that way.
- **Color is never the only signal.** Grid uses 🟩/🟥/⬛/⬜ shapes-as-emoji, not just hue, so colorblind players read state. Maintain this rule for any future status indicator.
- **One-handed phone use.** Primary tap targets ≥ 40px. The activity is often played on a phone in voice chat.
- **Discord-iframe constraints.** Clipboard, popups, and external nav can be blocked — design fallbacks (e.g. share-button copy state) without surprising the player.
