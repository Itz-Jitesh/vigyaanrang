export const MAX_LOGS = 200;

export type EventType = "flag_captured";

export type EventLog = {
  id: string;
  event: EventType;
  user: string;
  flag: string;
  timestamp: string;
};

export type EventPayload = {
  event: EventType;
  user: string;
  flag: string;
  timestamp: string;
};

export type StreamMessage =
  | {
      type: "event";
      payload: EventLog;
    }
  | {
      type: "clear";
    };

type Listener = (message: StreamMessage) => void;

type LogStore = {
  logs: EventLog[];
  listeners: Set<Listener>;
};

declare global {
  var __ctfEventStore: LogStore | undefined;
}

const store = globalThis.__ctfEventStore ?? {
  logs: [],
  listeners: new Set<Listener>(),
};

globalThis.__ctfEventStore = store;

export function getLogs(): EventLog[] {
  return [...store.logs];
}

export function addLog(payload: EventPayload): EventLog {
  const log: EventLog = {
    id: crypto.randomUUID(),
    event: payload.event,
    flag: payload.flag,
    user: payload.user,
    timestamp: payload.timestamp,
  };

  store.logs = [log, ...store.logs].slice(0, MAX_LOGS);
  emit({ type: "event", payload: log });

  return log;
}

export function clearLogs(): void {
  store.logs = [];
  emit({ type: "clear" });
}

export function subscribe(listener: Listener): () => void {
  store.listeners.add(listener);

  return () => {
    store.listeners.delete(listener);
  };
}

function emit(message: StreamMessage): void {
  for (const listener of store.listeners) {
    listener(message);
  }
}
