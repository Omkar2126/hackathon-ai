type Listener = (payload: string) => void;

const listeners = new Set<Listener>();

export function publishLive(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const listener of listeners) listener(payload);
}

export function subscribeLive(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
