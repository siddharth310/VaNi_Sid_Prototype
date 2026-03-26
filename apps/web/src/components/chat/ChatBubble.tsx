export interface ChatBubbleProps {
  role: 'agent' | 'user';
  text: string;
  accentColor: string;
}

export function ChatBubble({ role, text, accentColor }: ChatBubbleProps): JSX.Element {
  const isAgent = role === 'agent';
  return (
    <div
      className={`flex w-full ${isAgent ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className="max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm"
        style={
          isAgent
            ? { backgroundColor: accentColor, color: '#0f172a' }
            : {
                backgroundColor: '#f0fdfa',
                color: '#134e4a',
                border: '1px solid #99f6e4',
              }
        }
      >
        {text}
      </div>
    </div>
  );
}
