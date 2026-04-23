export function getApiBase(): string {
  return import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? '';
}

export function getAutoAgentEndpoint(): string {
  const base = getApiBase();
  return `${base}/api/agents/auto`;
}
