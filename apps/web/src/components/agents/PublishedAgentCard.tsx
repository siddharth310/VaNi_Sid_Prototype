import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBase } from '../../lib/api.js';

export type PublishedAgentSummary = {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  publishedAt: string | null;
  isBuiltIn: boolean;
};

type Props = {
  agent: PublishedAgentSummary;
  onChanged: () => void;
};

function IconDisable({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M5 5l14 14" strokeLinecap="round" />
    </svg>
  );
}

function IconDelete({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function PublishedAgentCard({ agent, onChanged }: Props): JSX.Element {
  const base = getApiBase();
  const [busy, setBusy] = useState(false);

  const unpublish = async (): Promise<void> => {
    if (
      !window.confirm(
        'Disable this agent? It will be removed from the live list until you publish again from Studio.'
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/agents/${agent.id}/unpublish`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(err.error ?? 'Could not disable agent');
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (
      !window.confirm(
        'Permanently delete this agent and its session history? This cannot be undone.'
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/agents/${agent.id}`, {
        method: 'DELETE',
      });
      if (res.status === 204) {
        onChanged();
        return;
      }
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(err.error ?? 'Could not delete agent');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-teal-100 bg-white/90 shadow-sm backdrop-blur-sm transition hover:border-teal-200 hover:shadow-md">
      <div className="absolute right-2 top-2 z-10 flex gap-0.5">
        <button
          type="button"
          disabled={busy}
          title="Disable (unpublish)"
          aria-label="Disable agent"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void unpublish();
          }}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"
        >
          <IconDisable className="h-4 w-4" />
        </button>
        {!agent.isBuiltIn ? (
          <button
            type="button"
            disabled={busy}
            title="Delete permanently"
            aria-label="Delete agent"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void remove();
            }}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
          >
            <IconDelete className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <Link to={`/agents/${agent.id}`} className="block p-4 pr-[4.25rem]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agent.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-800">{agent.name}</div>
            <div className="text-xs text-slate-500">{agent.category}</div>
          </div>
        </div>
        <div
          className="mt-3 h-1.5 rounded-full"
          style={{ backgroundColor: agent.color }}
        />
        <p className="mt-3 text-xs font-medium text-teal-600">Voice & chat →</p>
      </Link>
    </div>
  );
}
