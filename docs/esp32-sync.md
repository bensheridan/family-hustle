# ESP32 sync — the home box

A companion to [pi-sync.md](pi-sync.md), and the cheaper of the two boxes in
[sync-boxes.md](sync-boxes.md). Same job, same contract, smaller box: one
family's backup document, kept on an ESP32 on the home Wi-Fi, that the
family's phones read and write.

The code is in [firmware/esp32](../firmware/esp32), and how to set it up is
in its README. This file is about why it is built the way it is.

---

## It is LAN-only, on purpose

The Pi brief says *HTTPS, always* and *Cloudflare Tunnel*. Neither survives
on an ESP32. `cloudflared` needs an operating system, and getting a
certificate the phones trust onto a microcontroller, then renewing it every
90 days, is a project bigger than this one.

An https page cannot call an http address: the browser blocks it as mixed
content. So the GitHub Pages app cannot use an ESP32. Instead **the ESP32
serves the app itself** (the hub build), with the API on the same origin. That
means no mixed content, no CORS and no certificate.

What that costs:

- **Away from home, nothing syncs.** The app keeps working from
  `localStorage`, and changes go when the phone is back on the Wi-Fi.
  Sync is late, not broken.
- **Tokens cross the Wi-Fi in plain HTTP**, protected only by the Wi-Fi's own
  encryption. That is acceptable on a home network and would not be acceptable
  anywhere else.
- **A second household cannot reach it.** That is not a goal right now
  (see sync-boxes.md).

`localStorage` belongs to an origin, so the copy at `bensheridan.github.io`
and the copy at `family-hustle.local` are strangers. Move a family across
with export and import. The stored format is the backup format, so a box can
be seeded from that file.

## Hardware

**An ESP32-S3 N16R8** (16 MB flash, 8 MB PSRAM). The PSRAM is not optional:
a PUT body is held whole while it is checked, and a plain ESP32's ~300 KB of
usable RAM is less than a busy family's year.

## Flash: two filesystems

```
app0     3 MB     firmware
state    10.9 MB  the family and its history        ← only the firmware writes here
spiffs   2 MB     the app (hub build, gzipped)      ← `pio run -t uploadfs` replaces this
```

`uploadfs` erases the partition it writes. If the app and the family shared
one, every app update would wipe the family. Splitting them makes that
impossible rather than something to remember.

The order matters. PlatformIO writes to the *last* filesystem partition in
the table, so the app's has to come after the family's. An earlier draft had
them the other way round, and the first image built was the size of the
family's partition. `guard_partitions.py` now fails the build if the order is
ever wrong. The firmware mounts both by name, so it does not care.

## Limits that differ from the Pi

| | Pi | ESP32 | why |
| --- | --- | --- | --- |
| max body | 5 MB | 512 KB → `413` | RAM; a real family is tens of KB |
| history kept | 50 | 20 | still weeks of undo |
| no clock yet | — | `503` | an `updatedAt` from 1970 is worse than waiting |
| storage full | — | `507` | the app treats it like `413` |

## Storage: one file that *is* the response

`/state/state.json` is byte for byte the body of `GET /api/state`:

```
{"version":13,"updatedAt":"…","updatedBy":"emma-phone","document":<exactly as sent>}
```

- **GET is a file send.** There is no parsing and no RAM cost, and the
  document comes back exactly as it was sent.
- **The version lives in RAM**, read once at boot, so health checks and
  `409`s never touch flash.
- **A write is two renames.** Write `state.tmp`. Rename the current file to
  `history/<version>.json`. Rename `state.tmp` to `state.json`. LittleFS is
  copy-on-write and its renames are atomic. A power cut between the two
  renames leaves no `state.json`, and boot promotes the newest history file.
  That is the only recovery the firmware needs.

## The PUT

The firmware has to pull out `expectedVersion` and `updatedBy`, check `app`
and `format`, and store the document **without re-serialising it**, because
re-serialised JSON is not byte-identical.

- ArduinoJson with a *filter* parses only those four fields and skips the
  rest without allocating. It is given a `const char*` so it copies instead
  of unescaping strings in place, which would corrupt the bytes about to be
  stored.
- `envelope.h` walks the top-level object to find the start and end of the
  `"document"` value. It is a copy of `server/envelope.ts`, and the two were
  checked against the same inputs, including a decoy `"document"` inside a
  string.

## Tokens and Wi-Fi

Typed in once over USB serial, kept in NVS, never compiled in. They are
compared in constant time, and logs show the token's name (`write`/`read`),
never its value.

## Not done yet

- **Off-box backups.** The Pi pushes a nightly copy elsewhere, and the ESP32
  cannot. For now it is *export to a file* from the app. A gentle monthly
  reminder on the writer's phone would be the next step.
- **App updates without USB.** OTA for the firmware and the app would need
  a second app partition and an upload route. Worth doing before selling
  boxes, not before using one.
