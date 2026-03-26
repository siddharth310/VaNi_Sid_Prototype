import { StudioWorkbench } from '../studio/StudioWorkbench.js';

export function AgentStudio(): JSX.Element {
  return (
    <div className="w-full min-w-0 rounded-2xl border border-teal-100/80 bg-white/50 shadow-sm md:m-2 md:overflow-hidden">
      <StudioWorkbench />
    </div>
  );
}
