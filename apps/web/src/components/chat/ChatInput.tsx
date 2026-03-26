import { useState } from 'react';

export interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');
  return (
    <div className="flex gap-2 border-t border-teal-100 bg-white/90 p-3 backdrop-blur-sm">
      <input
        className="flex-1 rounded-xl border border-teal-100 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
        placeholder="Type your message..."
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const t = value.trim();
            if (t) {
              onSend(t);
              setValue('');
            }
          }
        }}
      />
      <button
        type="button"
        disabled={disabled || !value.trim()}
        onClick={() => {
          const t = value.trim();
          if (t) {
            onSend(t);
            setValue('');
          }
        }}
        className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-teal-500/20 disabled:opacity-40"
      >
        Send
      </button>
    </div>
  );
}
