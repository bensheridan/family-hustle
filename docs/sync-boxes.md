# Sync boxes

One family's data, shared between their phones through a small box they own.
There are two boxes, at two price points, and one app that talks to either.

| | **Home** — ESP32 | **Anywhere** — Raspberry Pi |
| --- | --- | --- |
| hardware | ESP32-S3 N16R8 board, USB power | Pi (Zero 2 W is enough), SD card, power supply |
| syncs | on the home Wi-Fi; changes made away wait until the phone is home | anywhere with signal, through a Cloudflare Tunnel |
| the app comes from | the box itself, `http://family-hustle.local/` | GitHub Pages, https |
| joining a phone | a token | an address and a token |
| looking after it | flash once; app updates over USB | an OS, Node and a tunnel to keep updated |
| off-box backups | exports from the app | nightly copy to somewhere else |
| design | [esp32-sync.md](esp32-sync.md) | [pi-sync.md](pi-sync.md) |
| code | `firmware/esp32/` | `server/` |

Both boxes keep the app working offline: `localStorage` stays the truth on
each phone, and the box is only where the copies meet.

Syncing between two households (a co-parent at another address) is not a
goal right now. The Pi could do it because it is reachable from anywhere; the
ESP32 cannot.

## One contract

Both boxes speak the contract in [pi-sync.md](pi-sync.md#the-contract), and
the same test holds them to it:

```bash
npm run test:sync                                   # the Node server, in a temp folder
FH_SYNC_URL=http://family-hustle.local \
  FH_WRITE_TOKEN=… FH_READ_TOKEN=… npm run test:sync   # a real box
```

On top of the original contract, both boxes return:

- `429` for a second write within two seconds, which protects the flash or
  SD card from a looping client
- `503` from the ESP32 when its clock has not synced yet
- `507` from the ESP32 when its storage is full

The app treats `429` and `503` like being offline (wait and retry), and `507`
like `413` (stop and say so).

## One app, two builds

| | command | base | sync address |
| --- | --- | --- | --- |
| pages | `npm run build` | `/family-hustle/` | typed in, must be https |
| hub | `npm run build:hub` | `/` | the page's own origin |

The only differences are the base path and whether the box's address is asked
for (`IS_HUB` in `src/lib/sync.ts`). The sync code is the same.

## In the app

- `src/lib/sync.ts`: the requests, and what this device remembers. Tokens
  are kept apart from the family's state, so they are never exported, backed
  up or synced.
- `src/state/sync.tsx`: when to sync, and what to do when the two copies
  disagree.
- `src/components/SyncSettings.tsx`: the *share with the family's box* card on
  the data screen.
- `src/components/SyncBar.tsx`: the bar and sheet shown when only a person can
  decide.
- Onboarding has *join my family's box*, so a second phone never sets up a
  family it would only throw away.

Which household a device belongs to (`homeHouseholdId`, `viewingAsHouseholdId`)
is never synced. It describes the phone, not the family.

## Trying it locally

```bash
npm run sync:dev                                                # a box on :8787, tokens in .sync-dev/config.json
FH_TARGET=hub FH_SYNC_PROXY=http://127.0.0.1:8787 npm run dev   # the hub build, /api proxied to it
```

Both are also in `.claude/launch.json` (`sync-box`, `family-hustle-hub`). For
a second phone, open the same dev server at a different host, such as
`http://partner.localhost:5174`. A different origin gets its own storage.
