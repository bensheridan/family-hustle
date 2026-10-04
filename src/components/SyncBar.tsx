import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { useSync } from '../state/sync';
import { summarise } from '../domain/backup';
import { Sheet } from './ui';

/** The few sync states worth interrupting someone for.
 *
 * Being offline is not one of them — the app works without the box, and
 * changes go when it is back. A conflict is: two copies moved apart and only
 * a person can say which one is right. So is a box that has stopped
 * accepting this phone, because otherwise changes pile up and go nowhere.
 */
export function SyncBar() {
  const { status, conflict } = useSync();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (conflict) {
    return (
      <>
        <div className="updatebar">
          <span>your family changed on another phone too.</span>
          <button type="button" onClick={() => setOpen(true)}>
            choose
          </button>
        </div>
        {open && <ConflictSheet onClose={() => setOpen(false)} />}
      </>
    );
  }

  const message =
    status === 'unauthorised'
      ? 'the family’s box no longer accepts this phone.'
      : status === 'too-big'
        ? 'the family’s box is full — changes here are not being shared.'
        : status === 'refused'
          ? 'the family’s box and this app do not agree on the format. try reloading.'
          : undefined;
  if (!message) return null;

  return (
    <div className="updatebar">
      <span>{message}</span>
      <button type="button" onClick={() => navigate('/data')}>
        look
      </button>
    </div>
  );
}

function ConflictSheet({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const { conflict, record, takeTheirs, keepMine } = useSync();
  if (!conflict) return null;

  const here = summarise(state);
  const there = conflict.summary;
  const when = new Date(conflict.remote.updatedAt).toLocaleString();

  return (
    <Sheet title="which version?" onClose={onClose}>
      <div className="card card--pad" style={{ marginBottom: 12 }}>
        <div className="row__title">on the box</div>
        <div className="row__meta" style={{ whiteSpace: 'normal' }}>
          changed by {conflict.remote.updatedBy} · {when}
          <br />
          {there.people} people · {there.entries} things on the calendar
        </div>
      </div>
      <div className="card card--pad" style={{ marginBottom: 16 }}>
        <div className="row__title">on this phone</div>
        <div className="row__meta" style={{ whiteSpace: 'normal' }}>
          {here.people} people · {here.entries} things on the calendar
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
        nothing gets merged — one of these replaces the other. if you are not sure, export a copy
        of this phone’s first from your data.
      </p>
      <button
        type="button"
        className="btn btn--accent btn--block"
        onClick={() => {
          takeTheirs();
          onClose();
        }}
      >
        use the box’s version
      </button>
      <button
        type="button"
        className={`btn btn--block ${record.readOnly ? 'btn--quiet' : 'btn--danger'}`}
        style={{ marginTop: 8 }}
        onClick={() => {
          keepMine();
          onClose();
        }}
      >
        {record.readOnly ? 'keep this phone’s, unshared' : 'keep this phone’s and replace the box’s'}
      </button>
    </Sheet>
  );
}
