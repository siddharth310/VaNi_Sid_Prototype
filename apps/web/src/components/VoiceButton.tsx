import { motion } from 'framer-motion';
import type { VoiceAssistantStatus } from '../hooks/useVoiceAssistant.js';

export interface VoiceButtonProps {
    status: VoiceAssistantStatus;
    disabled?: boolean;
    onClick: () => void;
}

function MicIcon(): JSX.Element {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
        >
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v2" />
            <path d="M8 21h8" />
        </svg>
    );
}

function StopIcon(): JSX.Element {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-3.5 w-3.5"
        >
            <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
    );
}

function Spinner(): JSX.Element {
    return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function VoiceButton({ status, disabled, onClick }: VoiceButtonProps): JSX.Element {
    const isListening = status === 'listening';
    const isSpeaking = status === 'speaking';
    const isProcessing = status === 'processing';

    return (
        <motion.button
            type="button"
            whileHover={disabled ? undefined : { scale: 1.04 }}
            whileTap={disabled ? undefined : { scale: 0.96 }}
            onClick={onClick}
            disabled={disabled}
            aria-label={isListening ? 'Stop listening' : isSpeaking ? 'Interrupt and listen' : 'Start voice input'}
            className={[
                'voice-button relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-white shadow-lg transition-all duration-200',
                isListening
                    ? 'bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-500/35'
                    : isSpeaking
                        ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/35 voice-button-speaking'
                        : isProcessing
                            ? 'bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-500/25'
                            : 'bg-gradient-to-br from-cyan-500 to-teal-500 shadow-cyan-500/30',
                disabled ? 'cursor-not-allowed opacity-60' : 'hover:shadow-xl',
            ].join(' ')}
        >
            {isListening && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="voice-wave" />
                </span>
            )}
            <span className="relative z-10 flex items-center justify-center">
                {isProcessing ? <Spinner /> : isListening ? <StopIcon /> : <MicIcon />}
            </span>
        </motion.button>
    );
}