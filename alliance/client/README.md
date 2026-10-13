# @alliance/client

Browser client. Against the master backend it runs in compat mode: the `welcome` carries no `ext`, and the
catalog comes from master `/data`.

## Running against master

The master reference copy lives in `../legacy` next to this repo. Once, there:

```sh
npm install
npm run assets   # pulls the vendored libraries and the game resources
```

Then start master (it listens on port 3000) with its default, client-run battles:

```sh
npm start
```

This client does not run battles itself yet: the field shows the battle status and progress, and master resolves
each battle on the server once its time limit and grace have passed. With `SP_COMBAT=server` master streams
battles without `b.start`; the field draws the streamed units, their HP, deaths and damage as stand-ins.

In this package:

```sh
pnpm dev
```

The dev server forwards `/ws`, `/data`, `/assets` and `/media` to the backend in `ALLIANCE_BACKEND`
(default `http://localhost:3000`), so the page stays same-origin. Set it in the shell or in `alliance/client/.env.local`:

```sh
ALLIANCE_BACKEND=http://localhost:3001 pnpm dev
```

## Pages

| Path | Part id | Shows |
| --- | --- | --- |
| `/` | `core:screen.entry` | code name, then create or join a room |
| `/profile` | `core:screen.profile` | code name, avatar, language, volume, quality and keys, kept in this browser |
| `/room/:id` | `core:screen.room` | the room and the loadout |
| `/room/:id/match` | `core:screen.match` | briefing, strategy, match and result, by phase |

A page opened directly first waits for the connection and for the room of a resumed session, then sends the player
to where the server holds them. A room link outside any room joins that room.

`window.alliance` offers `enter`, `createRoom`, `joinRoom`, `submit` and `view` for driving the page from a console.
