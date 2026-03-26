export interface LanguageBadgeProps {
  code: string;
}

export function LanguageBadge({ code }: LanguageBadgeProps): JSX.Element {
  const label = code.trim().slice(0, 2).toUpperCase() || 'EN';
  return (
    <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold tracking-wide text-teal-800">
      {label}
    </span>
  );
}
