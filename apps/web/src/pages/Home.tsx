import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublishedAgentCard } from '../components/agents/PublishedAgentCard.js';
import { AutoAgentChat } from '../components/AutoAgentChat.js';
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

const METRIC_CARDS = [
  {
    label: 'Calls handled (24h)',
    value: '1,284',
    hint: 'vs. prior day',
    delta: '+12%',
    positive: true,
  },
  {
    label: 'Avg. resolution time',
    value: '3m 42s',
    hint: 'voice + chat',
    delta: '−8%',
    positive: true,
  },
  {
    label: 'Efficiency score',
    value: '94%',
    hint: 'model-assisted',
    delta: 'stable',
    positive: true,
  },
  {
    label: 'Escalations',
    value: '18',
    hint: 'to human',
    delta: '−3',
    positive: true,
  },
] as const;

export function Home(): JSX.Element {
  const base = getApiBase();
  const [agents, setAgents] = useState<AgentRow[]>([]);

  const loadAgents = useCallback(async () => {
    try {
      const r = await fetch(`${base}/api/agents`);
      setAgents(await (r.json() as Promise<AgentRow[]>));
    } catch {
      setAgents([]);
    }
  }, [base]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const published = useMemo(
    () => agents.filter((a) => a.publishedAt !== null),
    [agents]
  );

  return (
    <div className="p-6 md:p-8">
      <section className="relative overflow-hidden rounded-3xl border border-teal-100 bg-gradient-to-br from-white via-cyan-50/80 to-emerald-50 p-8 shadow-sm md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/4 h-40 w-40 rounded-full bg-sky-200/50 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">
          Virtual Hospital Operating System
        </p>
        <h1 className="relative mt-3 text-3xl font-bold tracking-tight text-slate-800 md:text-4xl">
          Build care agents that{' '}
          <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
            scale compassion
          </span>
          , not complexity.
        </h1>
        <p className="relative mt-4 max-w-3xl text-base leading-relaxed text-slate-600">
          VHOS helps hospitals design, test, and deploy their own voice and chat
          agents — for scheduling, follow-ups, triage prep, education, and more.
          Your teams stay in control: guardrails, languages, and clinical tone
          match how you already work, while patients get clear, 24/7 guidance.
        </p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <Link
            to="/studio"
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/25 transition hover:from-teal-600 hover:to-emerald-600"
          >
            Open Agent Studio
          </Link>
          <Link
            to="/agents"
            className="inline-flex items-center rounded-xl border-2 border-teal-200 bg-white px-5 py-2.5 text-sm font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-50/50"
          >
            Try live agents
          </Link>
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-sky-100 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
          <div className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
            Mission
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-800">
            Put hospital-grade automation in every care pathway
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            We believe operations teams should ship safe, multilingual patient
            experiences without waiting on long IT queues. VHOS is the workshop
            where clinical intent becomes conversational software — with
            mandatory tests, PHI-minded defaults, and voice that feels human.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
          <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Vision
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-800">
            A healthier ecosystem of tailored agents
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            In five years, every hospital network will run dozens of small,
            specialized agents — each aligned to a service line, not a generic
            chatbot. VHOS is the platform to author, govern, and evolve that
            layer: measurable, auditable, and continuously improving alongside
            your staff.
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-800">Snapshot metrics</h2>
        <p className="mt-1 text-sm text-slate-600">
          Illustrative operational pulse (sample data) — connect your analytics
          when ready.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {METRIC_CARDS.map((m) => (
            <div
              key={m.label}
              className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {m.label}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-slate-800">
                  {m.value}
                </span>
                <span
                  className={`text-xs font-medium ${
                    m.positive ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                >
                  {m.delta}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{m.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Published agents
            </h2>
            <p className="text-sm text-slate-600">
              {published.length === 0
                ? 'Publish from Studio to list agents here.'
                : `${published.length} live — open voice or chat for each.`}
            </p>
          </div>
          <Link
            to="/studio"
            className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-teal-500/20 hover:from-teal-600 hover:to-cyan-600"
          >
            Open Studio
          </Link>
        </div>

        {published.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 px-4 py-10 text-center text-sm text-slate-600">
            No published agents yet. Complete tests and publish from{' '}
            <Link to="/studio" className="font-medium text-teal-700 hover:underline">
              Studio
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {published.map((a) => (
              <li key={a.id}>
                <PublishedAgentCard agent={a} onChanged={() => void loadAgents()} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AutoAgentChat />
    </div>
  );
}
