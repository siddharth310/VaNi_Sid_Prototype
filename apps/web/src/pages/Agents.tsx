import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublishedAgentCard } from '../components/agents/PublishedAgentCard.js';
import { getApiBase } from '../lib/api.js';

interface AgentRow {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  publishedAt: string | null;
  isBuiltIn: boolean;
}

export function Agents(): JSX.Element {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const base = getApiBase();

  const loadAgents = useCallback(async () => {
    try {
      const r = await fetch(`${base}/api/agents`);
      setRows(await (r.json() as Promise<AgentRow[]>));
    } catch {
      setRows([]);
    }
  }, [base]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const published = useMemo(
    () => rows.filter((a) => a.publishedAt !== null),
    [rows]
  );

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-bold text-slate-800">Agents</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        Published agents appear here. Each card opens dedicated voice and chat
        for that agent — tuned in Studio, live for patients and staff.
      </p>

      {published.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 px-4 py-10 text-center text-sm text-slate-600">
          No published agents yet. Publish from{' '}
          <Link to="/studio" className="font-medium text-teal-700 hover:underline">
            Studio
          </Link>{' '}
          to appear here.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((a) => (
            <li key={a.id}>
              <PublishedAgentCard agent={a} onChanged={() => void loadAgents()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
