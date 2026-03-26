import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { Home } from './pages/Home.js';
import { Agents } from './pages/Agents.js';
import { AgentPlayground } from './pages/AgentPlayground.js';
import { AgentStudio } from './pages/AgentStudio.js';

const navClass = ({ isActive }: { isActive: boolean }): string =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-teal-100 text-teal-900 shadow-sm'
      : 'text-slate-600 hover:bg-teal-50/80 hover:text-teal-800'
  }`;

export function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-emerald-50 text-slate-800">
      <header className="sticky top-0 z-40 border-b border-teal-100/80 bg-white/80 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 text-lg font-bold text-white shadow-md">
              V
            </span>
            <div>
              <div className="text-base font-bold tracking-tight text-slate-800">
                VHOS
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-teal-600">
                Care agents
              </div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/" className={navClass} end>
              Home
            </NavLink>
            <NavLink to="/agents" className={navClass}>
              Agents
            </NavLink>
            <NavLink to="/studio" className={navClass}>
              Studio
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-2 pb-12">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:id" element={<AgentPlayground />} />
          <Route path="/studio" element={<AgentStudio />} />
          <Route path="/studio/:id" element={<AgentStudio />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
