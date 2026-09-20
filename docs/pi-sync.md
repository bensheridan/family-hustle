# Pi sync — instructions for the agent on the Raspberry Pi

You are setting up a small sync service for **Family hustle**, a family
organisation web app. The app is at https://bensheridan.github.io/family-hustle/
and its source is at https://github.com/bensheridan/family-hustle.

Today the app keeps everything in the browser's `localStorage` on one device.
Your job is to give one family's data a home on this Pi so their phones can
share it. Nothing else about the app changes.

Read all of this before starting. The decisions in **Decisions already made**
are settled — implement them rather than reopening them. If something here is
impossible on this machine, say so and stop rather than substituting a
different design.

---

## What this has to do

One family. A handful of devices. A blob of JSON, kept in one place, that
their phones read and write.

That is the whole thing. It is not a platform, it does not have signups, and
it is not multi-tenant. Resist every urge to make it one.

## Who edits

**One person edits; the others read.** In the family this is being built for,
Emma adds and changes things and her partner looks at them.

That single fact removes the hardest part of sync. With one writer there is
nothing to merge: the writer's copy is simply the truth, and readers take it.
Build exactly that. Do not build merge, CRDTs, operational transforms, or a
change log. If a second writer appears later, the version check below is the
hook that makes it possible — but it is not today's problem and speculative
machinery for it will be wrong when the time comes.

Give this effect with **two tokens**:

- a **write token**, which can read and write
- a **read token**, which can only read

Emma's phone gets the write token. Everyone else gets the read one.

---

## Decisions already made

Implement these. They are not up for debate.

**HTTPS, always.** The app is served over HTTPS from GitHub Pages, so a
browser will refuse to call an HTTP endpoint from it — mixed content is
blocked outright, and you will waste an afternoon on a request that never
leaves the page. There is no HTTP mode, not even for testing from the phone.

**No port forwarding.** Do not open a port on the home router, and do not
touch the router at all. Use a **Cloudflare Tunnel** (`cloudflared`), which
gives an HTTPS hostname, a certificate, and no inbound holes. Tailscale would
also be private and secure, but a co-parent in another household could not
reach it, and that is a likely next step — so the tunnel.

**The stored format is the app's own backup format.** Do not invent a schema.
The app already exports exactly this, defined in `src/domain/backup.ts`:

```json
{
  "app": "family-hustle",
  "format": 1,
  "savedAt": "2026-09-20T08:50:47.000Z",
  "state": { "settings": {}, "people": [], "entries": [], "...": "..." }
}
```

Store that document as-is. Never parse, reshape or migrate `state` — it is the
client's business and it changes as the app changes. You are a filing cabinet,
not a database schema.

This also means a family can seed the server from a file they exported, and
pull the server's copy into a file. The two features are the same shape on
purpose.

**Plain files on disk, not a database.** One family's state is tens of
kilobytes. A file is inspectable, greppable, trivially backed up, and survives
this service being deleted.

**Node, because the client is TypeScript.** If Node is not already present,
install the current LTS. If you have a strong reason to prefer something else,
say so and wait — do not silently choose.

---

## The contract

The web app will be written against exactly this. Do not change paths, status
codes or field names without saying so, because the client must match.

Every request carries `Authorization: Bearer <token>`.

### `GET /api/state`

Returns the current document, plus the version it is at.

```
200 { "version": 12, "updatedAt": "…", "updatedBy": "emma-phone", "document": { …backup format… } }
204 (no body)   — nothing stored yet; the client should offer to push its own
401             — missing or unknown token
```

### `PUT /api/state`

Replaces the document. Requires the write token.

```
Request:  { "expectedVersion": 12, "updatedBy": "emma-phone", "document": { … } }

200 { "version": 13, "updatedAt": "…" }
409 { "version": 14, "updatedAt": "…", "updatedBy": "…" }
      — someone else wrote since the client last read. The client decides;
        the server never merges and never silently overwrites.
403   — read token tried to write
400   — body is not the backup format (check `app` and `format` only)
413   — larger than 5 MB
```

`expectedVersion: 0` means "I believe nothing is stored yet".

### `GET /api/health`

`200 { "ok": true, "version": 12 }`, no auth. For checking the tunnel is up.
It must not reveal anything about the family.

---

## Build it in this order

Verify each step before starting the next. If a step cannot be verified, stop
and report rather than continuing on an assumption.

### 1. Take stock

Report back: OS and version, architecture, Node version if any, whether
`cloudflared` is present, free disk, and whether this Pi already runs anything
on a port. Do not install anything yet.

### 2. The service

Somewhere sensible like `/opt/family-hustle-sync`, a small Node HTTP service
implementing the contract. No framework is needed; if you want one, Express is
fine and anything larger is not.

- Listen on `127.0.0.1` only. The tunnel reaches it; nothing else should.
- Store at `/var/lib/family-hustle/state.json`.
- **Write atomically**: write a temp file in the same directory, `fsync`, then
  `rename` over the target. A half-written state file after a power cut is the
  one failure that loses a family's data, and the Pi will lose power.
- Before each write, copy the current file to
  `/var/lib/family-hustle/history/<version>.json`. Keep the last 50. Disk is
  cheap and undo is worth more than tidiness.
- `version` is a monotonic integer in the stored document's envelope. Keep it
  server-side; never trust the client's idea of it beyond the compare.
- Compare tokens with a **timing-safe** comparison, not `===`.
- Log one line per request: time, method, status, token *name* (never the
  token). Never log the document.
- Rate limit writes: one every 2 seconds per token is plenty and stops a
  looping client hammering the SD card.

### 3. Tokens

Generate two, 32 bytes of randomness, hex or base64url:

```bash
openssl rand -hex 32
```

Put them in `/etc/family-hustle/config.json`, mode `600`, owned by the service
user. Never in the repo, never in a log, never in a URL, never echoed into
shell history you leave behind.

Create a dedicated system user with no login shell. Do not run as root or pi.

### 4. Service management

A `systemd` unit that starts on boot, restarts on failure, and runs as that
user. Harden it: `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, and
`ReadWritePaths` limited to the data directory.

Verify by rebooting and confirming it comes back on its own.

### 5. CORS

The browser will call this from `https://bensheridan.github.io`. Allow exactly
that origin, plus `http://localhost:5173` for development. Not `*`.

Handle `OPTIONS` preflight, and allow the `Authorization` and `Content-Type`
headers.

### 6. The tunnel

`cloudflared` as a named tunnel, pointed at `http://127.0.0.1:<port>`, on a
hostname under the domain. Run it as a service so it survives a reboot too.

Verify from a machine that is *not* on the home network — a phone on mobile
data is the honest test. Localhost proving anything here is a trap.

### 7. Backups

The state file, the history directory and the config to somewhere off this Pi,
daily. An SD card is not a backup and this one will fail eventually.

Say plainly in your report where the backup goes and how to restore it. A
backup nobody has restored is a rumour.

---

## Verify before you hand it over

Do these as a browser would, over the tunnel hostname, not against localhost:

1. `GET /api/health` returns ok.
2. `GET /api/state` with no token → 401.
3. `GET /api/state` with a made-up token → 401.
4. `PUT` with the read token → 403.
5. `PUT` with the write token and `expectedVersion: 0` → 200, version 1.
6. `GET` returns exactly the document that was sent, byte for byte.
7. `PUT` again with a stale `expectedVersion` → 409, and the stored document
   is **unchanged**.
8. `PUT` a body that is not the backup format → 400, stored document unchanged.
9. Reboot the Pi. Both services return. State survives.
10. Pull the power mid-write if you can contrive it. The state file is either
    the old document or the new one, never half of either.

Report the results of each. "Should work" is not a result.

---

## What the app will do (context, not your job)

For your understanding of the shape:

- A settings screen takes the server URL and a token.
- On open, the app `GET`s. If the server is newer, it offers to take it.
- On change, it `PUT`s, debounced.
- On `409`, it tells the person plainly and offers to reload the server's copy
  or overwrite it. It never picks silently.
- `localStorage` stays the local truth so the app works with no signal, and
  syncs when it has some.

If the contract needs to change to be sensible, say so in your report — the
client has to be written to match, and it is better to find out now.

---

## Do not

- Do not open a router port.
- Do not serve over HTTP and hope.
- Do not put tokens in the repo, a log, a URL or a QR code.
- Do not parse, migrate or "fix" the `state` object.
- Do not merge conflicting writes. Refuse and let the person decide.
- Do not add accounts, signup, password reset, or a second family.
- Do not make this a public service. It is one family's filing cabinet.
- Do not delete `/var/lib/family-hustle` for any reason.

## When you are done

Report:

1. The hostname.
2. Where the tokens are, and how to read them — not the tokens themselves.
3. The results of all ten checks.
4. Anything you changed from this document, and why.
5. Where backups go and the exact command to restore one.
