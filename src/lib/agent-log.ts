export function agent_log(payload: {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  hypothesisId?: string;
  runId?: string;
}) {
  fetch('/api/debug-log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: '470d82',
      timestamp: Date.now(),
      ...payload,
    }),
  }).catch(() => {});
}
