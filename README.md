# Nitro Rush: Racing Crash

A standalone crash game from the Gold Fever Crash Collection, built with React + TypeScript.
This folder holds only Nitro Rush; the app opens straight into the game.

## Play it now

Open `play.html` in a browser. It is a self-contained build (it loads its fonts from Google Fonts).

## Run the project

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run typecheck
```

## Files

| Path | What it does |
| --- | --- |
| `src/scenes/nitro-rush.js` | The Nitro Rush scene: artwork, animation, crash and cash-out effects |
| `src/scenes/index.js` | Registers the scene (add more imports here to bundle more games) |
| `src/engine/core.js` | Shared drawing utilities, particles and the verifiable outcome generator |
| `src/engine/art.js` | Art toolkit: textures, sprites, clouds, lighting, grain, characters |
| `src/game/controller.ts` | Round lifecycle, two bet slots, settlement, simulated players, crash curve |
| `src/game/wallet.ts` | Demo-credit balance and session stats |
| `src/game/audio.ts` | Synthesised sound effects |
| `src/components/` | React UI: game view, bet panels, live bets, how to play, provably fair |

## Rules

- Multiplier grows as `m(t) = e^(0.09·t)`; crash point `floor(97 / (1 − r)) / 100`, a 97% return to player.
- `r = HMAC-SHA256(serverSeed, clientSeed:nonce:path)`; the seed hash is shown before each round and the seed revealed after.

This is a client-side demo using demo credits. A real-money product needs the outcome generation, bets and
settlement on an authoritative server, and a gambling licence where it operates.
