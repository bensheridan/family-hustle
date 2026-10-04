import { useState } from 'react';
import { useSync, type SyncStatus } from '../state/sync';
import { IS_HUB, defaultDeviceName, type SyncConfig } from '../lib/sync';
import { Field } from './ui';

/** Connecting this device to the family's box, and saying how it is going.
 *
 * On a hub build the app came from the box, so the address is already known
 * and only the token is asked for. Elsewhere — the GitHub Pages copy talking
 * to a Pi — the address is asked for too, and has to be https.
 */
export function SyncSettings() {
  const { record, status, unsent, disconnect, seed } = useSync();

  if (!record.config) return <ConnectForm />;

  /* Turned away by the box — a token mistyped, or changed on the box. The
   * only way out used to be "stop syncing", then connect again, which nobody
   * would guess; so ask for the token again, right here. */
  if (status === 'unauthorised') {
    return (
      <ConnectForm
        previous={record.config}
        notice="the box doesn’t accept this phone’s token. enter it again — check for a stray space at either end."
      />
    );
  }

  const last = record.last;
  return (
    <div className="card card--pad">
      <div className="row__title">{describe(status, unsent)}</div>
      <div className="row__meta" style={{ whiteSpace: 'normal' }}>
        {IS_HUB ? 'the box this app came from' : record.config.url} · this is “{record.config.device}”
        {last?.updatedBy && last.version > 0
          ? ` · last changed by ${last.updatedBy}, ${new Date(last.updatedAt).toLocaleString()}`
          : ''}
      </div>
      {record.readOnly && (
        <p className="field__hint" style={{ marginTop: 10 }}>
          this phone has a read-only token: it shows what is on the box, and anything changed here
          stays on this phone.
        </p>
      )}
      {status === 'empty' && !record.readOnly && (
        <button
          type="button"
          className="btn btn--accent btn--block"
          style={{ marginTop: 12 }}
          onClick={seed}
        >
          put this family on the box
        </button>
      )}
      <button
        type="button"
        className="btn btn--ghost btn--block"
        style={{ marginTop: 12 }}
        onClick={disconnect}
      >
        stop syncing this device
      </button>
      <p className="field__hint" style={{ marginTop: 10 }}>
        your family stays on this device and on the box. this only stops them talking.
      </p>
    </div>
  );
}

function ConnectForm({ previous, notice }: { previous?: SyncConfig; notice?: string }) {
  const { connect } = useSync();
  const [url, setUrl] = useState(previous?.url ?? '');
  const [token, setToken] = useState('');
  const [device, setDevice] = useState(previous?.device ?? defaultDeviceName());
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  const submit = async () => {
    setError(undefined);
    setWorking(true);
    const config: SyncConfig = { url: IS_HUB ? '' : url.trim(), token: token.trim(), device: device.trim() || defaultDeviceName() };
    setError(await connect(config));
    setWorking(false);
  };

  const ready = token.trim().length > 0 && (IS_HUB || url.trim().length > 0);

  return (
    <div className="card card--pad">
      {notice && <p className="importwarn" style={{ marginTop: 0 }}>{notice}</p>}
      {!IS_HUB && (
        <Field label="the box’s address" hint="starts with https://">
          <input
            className="input"
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="https://hustle.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
      )}
      <Field
        label="token"
        hint="the editing phone gets the write token; everyone else gets the read one."
      >
        <input
          className="input"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </Field>
      <Field label="call this device" hint="shown to the family as “changed by …”">
        <input className="input" value={device} onChange={(e) => setDevice(e.target.value)} />
      </Field>
      {error && <p className="importwarn">{error}</p>}
      <button
        type="button"
        className="btn btn--accent btn--block"
        disabled={!ready || working}
        onClick={() => void submit()}
      >
        {working ? 'connecting…' : 'connect'}
      </button>
    </div>
  );
}

function describe(status: SyncStatus, unsent: boolean): string {
  switch (status) {
    case 'off':
      return 'not syncing';
    case 'checking':
      return 'checking the box…';
    case 'saving':
      return 'saving to the box…';
    case 'synced':
      return 'up to date with the box';
    case 'offline':
      return unsent
        ? 'can’t reach the box — your changes will go when it’s back'
        : 'can’t reach the box right now';
    case 'unauthorised':
      return 'the box doesn’t accept this token any more';
    case 'read-only':
      return unsent ? 'showing the box’s family, with changes made here' : 'up to date with the box';
    case 'diverged':
      return 'changed here and on another phone — choose which to keep';
    case 'empty':
      return 'the box is empty';
    case 'too-big':
      return 'the box is full — changes here are not being shared';
    case 'refused':
      return 'the box and this app disagree on the format — try reloading';
  }
}
