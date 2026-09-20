import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import {
  canLinkToFile,
  parseBackup,
  serialise,
  suggestedFilename,
  summarise,
  type BackupSummary,
} from '../domain/backup';
import {
  askPermission,
  forgetHandle,
  recallHandle,
  rememberHandle,
  writeFile,
  type WritableHandle,
} from '../lib/fileHandle';
import { SectionHead } from '../components/ui';
import type { State } from '../types';

/** The family's data, as a file they keep.
 *
 * Everything is in one readable JSON file. Put it in iCloud Drive or
 * OneDrive and the folder carries it between devices; back it up the way
 * anything else gets backed up; open it in a text editor long after this app
 * has stopped existing.
 */
export function Data() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [handle, setHandle] = useState<WritableHandle | undefined>();
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<{ state: State; summary: BackupSummary } | null>(null);

  const here = summarise(state);
  const linkable = canLinkToFile();

  useEffect(() => {
    void recallHandle().then(setHandle);
  }, []);

  /* While a file is linked, every change is written straight to it. The
   * whole state is small, and a file that is one save behind is worse than
   * useless — it is quietly wrong. */
  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (!(await askPermission(handle))) return;
        await writeFile(handle, serialise(state));
        if (!cancelled) setStatus(`saved to ${handle.name}`);
      } catch {
        if (!cancelled) setError('could not write to the linked file.');
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, handle]);

  const download = () => {
    const blob = new Blob([serialise(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedFilename();
    a.click();
    URL.revokeObjectURL(url);
    setStatus('saved to your downloads.');
  };

  const chooseFile = async () => {
    setError(undefined);
    try {
      const picker = (
        window as unknown as {
          showSaveFilePicker: (o: unknown) => Promise<WritableHandle>;
        }
      ).showSaveFilePicker;
      const chosen = await picker({
        suggestedName: suggestedFilename(),
        types: [{ description: 'Family hustle backup', accept: { 'application/json': ['.json'] } }],
      });
      await writeFile(chosen, serialise(state));
      await rememberHandle(chosen);
      setHandle(chosen);
      setStatus(`linked to ${chosen.name}`);
    } catch {
      // the picker was dismissed; nothing to report
    }
  };

  const unlink = async () => {
    await forgetHandle();
    setHandle(undefined);
    setStatus('no longer writing to a file. your data is still here.');
  };

  const onFile = async (file: File) => {
    setError(undefined);
    setStatus(undefined);
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPending({ state: result.state, summary: result.summary });
  };

  const confirmImport = () => {
    if (!pending) return;
    dispatch({ type: 'reset', state: pending.state });
    setPending(null);
    navigate('/');
  };

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">your data</div>
          <div className="topbar__sub">one file, yours to keep</div>
        </div>
        <Link className="btn btn--sm btn--quiet" to="/more">
          back
        </Link>
      </header>

      <div className="card card--pad" style={{ marginTop: 14 }}>
        <div className="row__title">what’s here</div>
        <div className="row__meta" style={{ whiteSpace: 'normal' }}>
          {here.people} people · {here.entries} things on the calendar ·{' '}
          {here.households} {here.households === 1 ? 'home' : 'homes'}
          {here.terms > 0 ? ` · ${here.terms} terms` : ''}
          {here.holidays > 0 ? ` · ${here.holidays} public holidays` : ''}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          right now this lives only in this browser, on this device. clearing your browsing data
          would take it with it.
        </p>
      </div>

      {status && <p className="databanner">{status}</p>}
      {error && <p className="importwarn">{error}</p>}

      <section className="section">
        <SectionHead title="save a copy" />
        <div className="card card--pad">
          <button type="button" className="btn btn--accent btn--block" onClick={download}>
            export to a file
          </button>
          <p className="field__hint" style={{ marginTop: 10 }}>
            a readable JSON file. put it in iCloud Drive, OneDrive, Dropbox — anywhere that backs
            itself up — and it travels with you.
          </p>
        </div>
      </section>

      {linkable && (
        <section className="section">
          <SectionHead title="keep a file up to date" />
          <div className="card card--pad">
            {handle ? (
              <>
                <div className="row__title">writing to {handle.name}</div>
                <p className="field__hint" style={{ marginTop: 6 }}>
                  every change is saved to that file as you make it.
                </p>
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  style={{ marginTop: 12 }}
                  onClick={unlink}
                >
                  stop writing to it
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--ghost btn--block" onClick={chooseFile}>
                  choose a file to keep updated
                </button>
                <p className="field__hint" style={{ marginTop: 10 }}>
                  pick a file inside your synced folder and every change is written to it. your
                  browser will ask again after a restart — a web page is not allowed to hold onto
                  your drive quietly.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead title="load a file" />
        <div className="card card--pad">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => fileInput.current?.click()}
          >
            import from a file
          </button>
          <p className="field__hint" style={{ marginTop: 10 }}>
            this replaces everything on this device. you’ll see what is in the file before anything
            changes.
          </p>
        </div>
      </section>

      <section className="section">
        <SectionHead title="two people, two phones" />
        <div className="card card--pad">
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
            a synced folder moves whole files and cannot see inside them. if two people change
            things at the same time, one version wins and the other becomes a conflicted copy —
            nothing is merged. a file is a good way to keep and carry a family’s data, and not yet
            a good way for two people to edit it at once.
          </p>
        </div>
      </section>

      {pending && (
        <div className="sheet-backdrop" onClick={() => setPending(null)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet__grab" />
            <h2 className="sheet__title">load this file?</h2>
            <div className="card card--pad" style={{ marginBottom: 12 }}>
              <div className="row__title">in the file</div>
              <div className="row__meta" style={{ whiteSpace: 'normal' }}>
                {pending.summary.people} people · {pending.summary.entries} things ·{' '}
                {pending.summary.households} {pending.summary.households === 1 ? 'home' : 'homes'}
                {pending.summary.savedAt
                  ? ` · saved ${new Date(pending.summary.savedAt).toLocaleString()}`
                  : ''}
              </div>
            </div>
            <div className="card card--pad" style={{ marginBottom: 16 }}>
              <div className="row__title">on this device now</div>
              <div className="row__meta" style={{ whiteSpace: 'normal' }}>
                {here.people} people · {here.entries} things · {here.households}{' '}
                {here.households === 1 ? 'home' : 'homes'}
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
              what is on this device will be replaced. export a copy first if you are not sure.
            </p>
            <button type="button" className="btn btn--danger btn--block" onClick={confirmImport}>
              replace everything with this file
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--block"
              style={{ marginTop: 8 }}
              onClick={() => setPending(null)}
            >
              cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
