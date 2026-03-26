import { useState } from 'react';

export interface PHIAuthModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (uhid: string, dob: string) => Promise<void>;
}

/**
 * Shared PHI gate UI — not under studio/.
 */
export function PHIAuthModal({
  open,
  onClose,
  onSubmit,
}: PHIAuthModalProps): JSX.Element | null {
  const [uhid, setUhid] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-teal-100 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-800">Verify identity</h2>
        <p className="mt-2 text-sm text-slate-600">
          To continue with protected health information, please confirm your UHID
          and date of birth.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            UHID
            <input
              className="mt-1 w-full rounded-lg border border-teal-100 bg-teal-50/30 px-3 py-2 text-sm text-slate-800 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-100"
              value={uhid}
              onChange={(e) => setUhid(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Date of birth (YYYY-MM-DD)
            <input
              className="mt-1 w-full rounded-lg border border-teal-100 bg-teal-50/30 px-3 py-2 text-sm text-slate-800 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-100"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              placeholder="1990-01-15"
            />
          </label>
        </div>
        {err ? (
          <p className="mt-2 text-sm font-medium text-rose-600">{err}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-teal-50 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setErr(null);
              setBusy(true);
              try {
                await onSubmit(uhid, dob);
                setUhid('');
                setDob('');
                onClose();
              } catch {
                setErr('Verification failed');
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
