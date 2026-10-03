# ESP32 sync box

The home box: an ESP32-S3 on the family's Wi-Fi that serves the app and keeps
the family's data, at `http://family-hustle.local/`. Why it is built this way
is in [docs/esp32-sync.md](../../docs/esp32-sync.md).

## You need

- An **ESP32-S3 with 16 MB flash and 8 MB PSRAM** — sold as "N16R8", e.g. an
  ESP32-S3-DevKitC-1-N16R8. A board without PSRAM will not do.
- A USB cable that carries data, not just power.
- [PlatformIO](https://platformio.org/install/cli): `brew install platformio`.
- On an Apple Silicon Mac without Rosetta, also `brew install mklittlefs`.
  PlatformIO's own copy is an Intel binary; `native_mklittlefs.py` uses the
  Homebrew one when it has to.

## First time

From the repo root:

```bash
npm run build:hub
```

That builds the app for the box and puts it in `firmware/esp32/data/www`.

```bash
cd firmware/esp32
pio run -t upload
pio run -t uploadfs
pio device monitor
```

`upload` flashes the firmware, `uploadfs` writes the app, and `monitor` opens
the serial console the rest of the setup happens in. In the console:

```
wifi        → asks for the network name, then the password, then reboots
scan        → lists the networks the board can see; the saved one is marked *
tokens      → asks for the write token, then the read token
status      → shows what it knows
```

Typing does not echo in the console; that is normal. If Wi-Fi does not
connect, the console says why, such as network not found or wrong password.
`scan` shows whether the name matches exactly. The board only sees 2.4 GHz
networks.

Make the two tokens on your computer, one at a time:

```bash
openssl rand -hex 32
```

Paste each into the console when it asks. They are stored on the board, never
in this repo and never in the firmware file. Keep a copy somewhere safe, such
as a password manager: they are how each phone joins.

Then on Emma's phone open `http://family-hustle.local/`, go to *more → your
data*, connect with the **write** token, and tap *put this family on the box*.
Everyone else opens the same address and chooses *join my family's box* with
the **read** token.

If `.local` does not resolve on someone's phone (some Android versions), give
the box a fixed address in the router and use that instead. `status` prints
the address it has.

## Updating the app

```bash
npm run build:hub && cd firmware/esp32 && pio run -t uploadfs
```

This is safe for the family's data. The app and the data live on separate
flash partitions (see `partitions.csv`), and `uploadfs` only touches the app's.
Phones notice the new version the next time they are opened.

## Checking it

The contract test the Pi's server passes runs against the board too. Run it
from the repo root on a computer on the same Wi-Fi:

```bash
FH_SYNC_URL=http://family-hustle.local FH_WRITE_TOKEN=… FH_READ_TOKEN=… npm run test:sync
```

It writes one test version and then puts the family's document back as a new
version. Both are in the box's history.

## Backups

The box keeps its last 20 versions, but they are on the same chip. For a copy
somewhere else, use *export to a file* on the data screen now and then.
