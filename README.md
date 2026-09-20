# Mood Swings — Game Assistant

A polished, rules-accurate companion app for the **Mood Swings** card game. It tracks the match for you — players, moods in play, scores, round wins, turn order, black-die rechecks, and Hurt Feelings — while you handle the physical cards.

Open it on your phone, add it to your Home Screen, and it works fully offline.

## What it does

- **Match tracking** — 2–4 players, individual moods per player (not just totals), scores computed live.
- **Turn flow** — active-player highlighting, one mood per turn, pass, extra plays from card effects, end-of-round detection.
- **Rules-accurate scoring** — black-die rechecks, earliest-turn tiebreaks, manual winner override (for cards like Sneakiness), loser-draw checklist, Hurt Feelings assignment with the latest-turn tiebreak, winner-goes-first next round, first to 3 round wins.
- **Mood management** — add from the full card reference, adjust values, rotate to secondary values, mark suppressed, move between players, remove.
- **Card reference** — all 133 first-edition cards plus the Love headliner, searchable, with concise effect summaries.
- **Rules** — the complete turn structure, scoring, and edge cases in-app.
- **Persistence** — the match auto-saves to your device; close Safari or the tab and resume exactly where you left off. Match history and player names are remembered.
- **Undo** — every change can be undone.
- **Offline / installable** — PWA with a service worker; install to Home Screen for a fullscreen, offline experience.

## Rules sources

Gameplay logic follows the published Mood Swings rules: 2–4 players share one deck, five cards each, one mood played per turn clockwise, moods stay in play between rounds, highest score wins the round (ties to the earliest turn that round), losers draw one card, lowest scorer in 3–4 player games gets Hurt Feelings (+1 mood next turn; ties to the latest turn), round winner goes first next round, first to three round wins takes the match. Card facts (names, colors, values, die types, rarities) were cross-checked against the open-source [mood-swings-vtt](https://github.com/didymusbenson/mood-swings-vtt) card dataset; effect summaries are original concise paraphrases written for this app.

This is an unofficial fan assistant, not affiliated with the game's publisher.

## Run it

No build step. Serve the folder and open it:

```bash
cd moodswings-gametracker
python3 -m http.server 8000
# open http://localhost:8000
```

Or deploy to GitHub Pages (Settings → Pages → Deploy from branch → `main`).

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, views, PWA hooks |
| `css/style.css` | Dark/glass theme, responsive layout |
| `js/cards.js` | 133-card database + Love headliner + Hurt Feelings helper |
| `js/engine.js` | Rules engine: turns, scoring, tiebreaks, persistence, undo |
| `js/ui.js` | All views and interactions |
| `js/app.js` | Boot, navigation, keyboard/back-button wiring |
| `manifest.webmanifest` / `sw.js` | PWA install + offline support |
| `icons/` | App icons |

## Privacy

Everything stays on your device. Match state, history, and player names live in `localStorage`; nothing is sent anywhere. Clearing browser data erases it.

## License

See `LICENSE`.
