export interface EscalationBannerProps {
  visible: boolean;
  message?: string;
  onDismiss: () => void;
}

export function EscalationBanner({
  visible,
  message = 'This session has been escalated to your care team.',
  onDismiss,
}: EscalationBannerProps): JSX.Element | null {
  if (!visible) {
    return null;
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
      <p className="text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs font-semibold text-amber-800 underline decoration-amber-400 hover:text-amber-950"
      >
        Dismiss
      </button>
    </div>
  );
}
