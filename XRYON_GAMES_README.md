# Xryon Arcade integration

## Added
- `src/components/xyron/GameCenter.jsx`: in-chat arcade, intent detector, Tic-Tac-Toe, Memory Match, Blackjack, War, compact Ludo-style race, and basic-movement chess with AI replies.
- `src/components/xyron/MessageBubble.jsx`: renders the game panel when a clear game request or game offer is detected.

## Notes / limitations
- No new dependencies were added.
- The compact Ludo implementation uses a shared 40-step race rather than the complete traditional cross-shaped board and full home paths.
- Chess currently validates piece movement and responds with a random legal piece move, but does not yet enforce check/checkmate, castling, en passant, repetition, or full promotion rules. Do not treat it as tournament-grade chess.
- The game component is mounted inside the message that triggers it. It is local UI state and is not persisted across reloads.
- A build/lint run could not be performed in this environment because the archive does not include `node_modules`. Run `npm install`, then `npm run build` and `npm run lint` in the project directory.
