import { motion } from 'framer-motion';
import type { OrbUiState } from '../../hooks/useRealtimeVoice.js';

export interface OrbProps {
  state: OrbUiState;
  /** 0–1 output amplitude (agent voice) */
  amplitude: number;
  /** Agent accent from spec, e.g. #00D4AA */
  accentColor: string;
}

/**
 * Self-contained orb — no imports from studio routes (extractable to patient app).
 */
export function Orb({ state, amplitude, accentColor }: OrbProps): JSX.Element {
  const scale =
    state === 'speaking'
      ? 1 + amplitude * 0.18
      : state === 'listening'
        ? 1.03
        : 1;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex h-[min(72vh,520px)] w-[min(72vh,520px)] items-center justify-center">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 200 200"
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              cx="100"
              cy="100"
              r={55 + i * 14}
              fill="none"
              stroke={accentColor}
              strokeOpacity={0.22 - i * 0.05}
              strokeWidth="1.5"
              animate={{
                scale:
                  state === 'speaking'
                    ? 1 + amplitude * (0.12 + i * 0.04)
                    : state === 'listening'
                      ? [1, 1.06, 1]
                      : state === 'thinking'
                        ? [1, 1.03, 1]
                        : 1,
                opacity:
                  state === 'idle' ? 0.15 : state === 'thinking' ? 0.45 : 0.75,
              }}
              transition={{
                duration:
                  state === 'speaking'
                    ? 0.12
                    : state === 'thinking'
                      ? 2.4
                      : 2.8,
                repeat:
                  state === 'speaking' || state === 'idle' ? 0 : Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </svg>
        <motion.div
          className="relative h-[42%] w-[42%] rounded-full shadow-2xl"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${accentColor}, #0f172a 75%)`,
            boxShadow: `0 0 60px ${accentColor}55`,
          }}
          animate={{
            scale: state === 'idle' ? 0.92 : scale,
            opacity: state === 'idle' ? 0.55 : 1,
          }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        />
        {state === 'thinking' ? (
          <motion.div
            className="absolute h-[48%] w-[48%] rounded-full border-2 border-dashed border-white/25"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          />
        ) : null}
      </div>
    </div>
  );
}
