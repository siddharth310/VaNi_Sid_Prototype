export interface CallControlsProps {
  onStart: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  mute: boolean;
  active: boolean;
}

export function CallControls({
  onStart,
  onEnd,
  onToggleMute,
  mute,
  active,
}: CallControlsProps): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-6 pb-10 pt-4">
      {!active ? (
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 transition hover:from-teal-600 hover:to-emerald-600"
        >
          Start Call
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onToggleMute}
            className={`rounded-full px-5 py-2 text-sm font-medium ${
              mute
                ? 'bg-rose-500 text-white shadow-md'
                : 'border border-teal-200 bg-white text-slate-700 shadow-sm'
            }`}
          >
            {mute ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="rounded-full bg-rose-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 hover:bg-rose-600"
          >
            End Call
          </button>
        </>
      )}
    </div>
  );
}
