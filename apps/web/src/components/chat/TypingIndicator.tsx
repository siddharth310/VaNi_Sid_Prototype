import { motion } from 'framer-motion';

export function TypingIndicator(): JSX.Element {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-teal-100 bg-white px-4 py-3 text-slate-500 shadow-sm">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-teal-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
      <span className="ml-2 text-xs font-medium">Agent is typing</span>
    </div>
  );
}
