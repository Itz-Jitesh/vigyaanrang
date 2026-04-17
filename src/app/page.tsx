"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EventLog, StreamMessage } from "@/lib/events";

type ConnectionStatus = "connected" | "disconnected";
type ConnectionMode = "sse" | "polling";
type Toast = {
  id: string;
  message: string;
};

type EventsResponse = {
  success: boolean;
  logs?: EventLog[];
  log?: EventLog;
  error?: string;
};

const SAMPLE_PAYLOAD = [
  {
    success: true,
    log: {
      id: "demo-webhook-event",
      event: "flag_captured",
      flag: "45",
      user: "123",
      timestamp: "2026-04-16T13:40:00Z",
    },
  },
] as const;

const ENABLE_SSE = true;

export default function Home() {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastApiError, setLastApiError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("sse");
  const [lastReceivedEvent, setLastReceivedEvent] = useState<string>("No events yet");
  const listRef = useRef<HTMLDivElement>(null);
  const hasInitializedNotificationsRef = useRef(false);
  const previousLogsCountRef = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const toastTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const totalFlagsCaptured = logs.length;
  const userCaptureCounts = getUserCaptureCounts(logs);

  console.log("RENDER:", logs.length);

  
  useEffect(() => {
    const latestLog = logs[0];
    setLastReceivedEvent(latestLog ? formatEventSummary(latestLog) : "No events yet");
  }, [logs]);

  const dismissToast = useCallback((toastId: string) => {
    const timeout = toastTimeoutsRef.current.get(toastId);

    if (timeout) {
      clearTimeout(timeout);
      toastTimeoutsRef.current.delete(toastId);
    }

    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  }, []);

  const playNotificationSound = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const audio = new Audio("/beep.wav");
    audio.preload = "auto";
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);

  const showToast = useCallback(
    (log: EventLog) => {
      const toastId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${log.id}-${Date.now()}`;

      setToasts((currentToasts) => [
        ...currentToasts,
        { id: toastId, message: `User ${log.user} captured flag ${log.flag}` },
      ]);

      const timeout = setTimeout(() => {
        dismissToast(toastId);
      }, 3500);

      toastTimeoutsRef.current.set(toastId, timeout);
    },
    [dismissToast],
  );

  useEffect(() => {
    if (!hasInitializedNotificationsRef.current) {
      hasInitializedNotificationsRef.current = true;
      previousLogsCountRef.current = logs.length;
      return;
    }

    const previousCount = previousLogsCountRef.current;
    const currentCount = logs.length;

    if (currentCount > previousCount) {
      const newLogs = logs.slice(0, currentCount - previousCount).reverse();

      for (const log of newLogs) {
        showToast(log);
        playNotificationSound();
      }
    }

    previousLogsCountRef.current = currentCount;
  }, [logs, playNotificationSound, showToast]);

  useEffect(() => {
    const toastTimeouts = toastTimeoutsRef.current;

    return () => {
      for (const timeout of toastTimeouts.values()) {
        clearTimeout(timeout);
      }

      toastTimeouts.clear();
    };
  }, []);
  
  useEffect(() => {
    const container = listRef.current;
    
    if (!container) {
      return;
    }
    
    container.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [logs]);
  
  const apiFetch = useCallback(
    async <T,>(url: string, init?: RequestInit, bodyForLog?: unknown) => {
      console.log("API CALL:", url, bodyForLog ?? init?.body ?? null);

      const response = await fetch(url, {
        ...init,
        cache: init?.cache ?? "no-store",
      });

      const data = (await response.json().catch(() => null)) as T | null;

      if (!response.ok) {
        const message =
          extractErrorMessage(data) ?? `Request failed with status ${response.status}`;
        setLastApiError(message);
        throw new Error(message);
      }

      setLastApiError(null);
      return data as T;
    },
    [],
  );

  const fetchLogs = useCallback(
    async (showLoader = true) => {
      if (showLoader) {
        setIsLoading(true);
      }

      try {
        console.log("Fetching logs...");
        const data = await apiFetch<EventsResponse>("/api/events", { cache: "no-store" });
        const serverLogs = Array.isArray(data.logs) ? [...data.logs] : [];
        setLogs((currentLogs) => {
          const nextLogs = reconcileLogs(serverLogs, currentLogs);
          console.log("SETTING LOGS:", nextLogs);
          return nextLogs;
        });
        setError(null);
        setConnectionStatus("connected");
      } catch (fetchError) {
        const message = getErrorMessage(fetchError, "Unable to load events.");
        setError(message);
        setConnectionStatus("disconnected");
      } finally {
        if (showLoader) {
          setIsLoading(false);
        }
      }
    },
    [apiFetch],
  );

  async function handleClearLogs() {
    if (isClearing) {
      return;
    }

    setIsClearing(true);
    setError(null);

    try {
      await apiFetch<EventsResponse>("/api/events", { method: "DELETE" });
      console.log("SETTING LOGS:", []);
      setLogs([]);
      setLastApiError(null);
    } catch (fetchError) {
      const message = getErrorMessage(fetchError, "Unable to clear logs.");
      setError(message);
    } finally {
      setIsClearing(false);
    }
  }

  async function handleTestApi() {
    if (isTestingApi) {
      return;
    }
    
    setIsTestingApi(true);
    setError(null);
    
    try {
      const data = await apiFetch<EventsResponse>(
        "/api/events",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(SAMPLE_PAYLOAD),
        },
        SAMPLE_PAYLOAD,
      );

      if (data.log) {
        setLogs((currentLogs) => {
          const nextLogs = appendLogs(currentLogs, [data.log as EventLog]);
          console.log("SETTING LOGS:", nextLogs);
          return nextLogs;
        });
      } else {
        await fetchLogs(false);
      }

      setLastApiError(null);
    } catch (fetchError) {
      const message = getErrorMessage(fetchError, "Unable to send test event.");
      setError(message);
    } finally {
      setIsTestingApi(false);
    }
  }

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      return;
    }

    setConnectionMode("polling");
    pollingRef.current = setInterval(() => {
      console.log("Polling fetch triggered");
      void fetchLogs(false);
    }, 5000);
  }, [fetchLogs]);
  
  const startEventStream = useCallback(() => {
    if (!ENABLE_SSE || typeof window === "undefined") {
      startPolling();
      return;
    }

    eventSourceRef.current?.close();
    setConnectionMode("sse");
    setConnectionStatus("disconnected");
    console.log("SSE connecting...");

    const eventSource = new EventSource(`${window.location.origin}/api/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connected");
      stopPolling();
      setConnectionMode("sse");
      setConnectionStatus("connected");
    };

    eventSource.onmessage = (event) => {
      console.log("SSE message:", event.data);

      try {
        const message = JSON.parse(event.data) as StreamMessage;

        if (message.type === "clear") {
          console.log("SETTING LOGS:", []);
          setLogs([]);
          setLastReceivedEvent("No events yet");
          return;
        }
        
        setConnectionStatus("connected");
        setLogs((currentLogs) => {
          const nextLogs = appendLogs(currentLogs, [message.payload]);
          console.log("SETTING LOGS:", nextLogs);
          return nextLogs;
        });
        setLastReceivedEvent(formatEventSummary(message.payload));
      } catch (streamError) {
        console.error("SSE message handling failed:", streamError);
      }
    };

    eventSource.onerror = () => {
      console.log("SSE error");
      setConnectionStatus("disconnected");
      eventSource.close();
      eventSourceRef.current = null;
      startPolling();
    };
  }, [startPolling, stopPolling]);

  
  useEffect(() => {
    void fetchLogs();
    startEventStream();

    return () => {
      eventSourceRef.current?.close();
      stopPolling();
    };
  }, [fetchLogs, startEventStream, stopPolling]);


  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_50%,_#020617_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="flex flex-col gap-5 border-b border-white/10 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    connectionStatus === "connected"
                      ? "bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.7)]"
                      : "bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.55)]"
                  }`}
                />
                {getConnectionLabel(connectionStatus)}
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  CTF Event Dashboard
                </h1>
                <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
                  Live flag submission events streamed over SSE with automatic polling fallback and
                  persisted in MongoDB.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleTestApi}
                disabled={isTestingApi}
                className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-100 transition duration-200 hover:border-cyan-300/40 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTestingApi ? "Sending..." : "Test API"}
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={isClearing || (!isLoading && logs.length === 0)}
                className="inline-flex items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-100 transition duration-200 hover:border-rose-300/40 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isClearing ? "Clearing..." : "Clear Logs"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 border-b border-white/10 px-6 py-4 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Captured Flags" value={String(totalFlagsCaptured)} />
            <StatCard label="Retention" value="All logs" />
            <StatCard label="Transport" value={getModeLabel(connectionMode)} />
            <StatCard
              label="Most Active User"
              value={userCaptureCounts[0] ? `User ${userCaptureCounts[0].user}` : "No captures"}
            />
          </div>

          <section className="grid gap-4 border-b border-white/10 px-6 py-5 lg:grid-cols-5">
            <DebugCard label="Logs Count" value={String(logs.length)} />
            <DebugCard
              label="Connection Status"
              value={connectionStatus === "connected" ? "connected" : "disconnected"}
            />
            <DebugCard label="Connection Mode" value={getModeLabel(connectionMode)} />
            <DebugCard label="Last Received Event" value={lastReceivedEvent} />
            <DebugCard
              label="Last API Error"
              value={lastApiError ?? "None"}
              tone={lastApiError ? "danger" : "neutral"}
            />
          </section>

          <div className="grid gap-4 px-3 py-3 sm:px-4 sm:py-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
              <div className="border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Live Capture Feed
              </div>

              <div ref={listRef} className="max-h-[32rem] overflow-y-auto">
                {isLoading ? (
                  <div className="flex min-h-72 items-center justify-center px-6 py-12 text-sm text-slate-400">
                    Loading capture events...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex min-h-72 items-center justify-center px-6 py-12 text-center text-sm text-slate-400">
                    No events yet
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6">
                    {logs.map((log: EventLog) => (
                      <LogItem key={log._id || log.id} log={log} />
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <aside className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
              <div className="border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                User Totals
              </div>

              {userCaptureCounts.length === 0 ? (
                <div className="px-5 py-10 text-sm text-slate-400">
                  No user captures recorded yet.
                </div>
              ) : (
                <ul className="divide-y divide-white/6">
                  {userCaptureCounts.map((entry) => (
                    <li
                      key={entry.user}
                      className="flex items-center justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <div className="text-sm font-semibold text-cyan-200">
                          User {entry.user}
                        </div>
                        <div className="text-xs text-slate-500">Flag captures</div>
                      </div>
                      <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm font-semibold text-cyan-100">
                        {entry.count}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>

          {error ? (
            <div className="border-t border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </section>
      </div>

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3 sm:right-6 sm:top-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-amber-400/20 bg-slate-950/95 shadow-xl shadow-slate-950/40 backdrop-blur"
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-300" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                  New Capture
                </div>
                <p className="mt-1 text-sm text-slate-100">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300 transition hover:bg-white/[0.08]"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function DebugCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        tone === "danger"
          ? "border-rose-500/20 bg-rose-500/10"
          : "border-white/8 bg-white/[0.03]"
      }`}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div
        className={`mt-2 text-sm font-semibold break-words ${
          tone === "danger" ? "text-rose-100" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function CaptureIcon() {
  return (
    <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/12 text-emerald-300">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
        <path d="M9 15h6" />
        <path d="M12 12v7" />
        <path d="M5 6H4a2 2 0 0 0 0 4h2" />
        <path d="M19 6h1a2 2 0 1 1 0 4h-2" />
      </svg>
    </span>
  );
}

function LogItem({ log }: { log: EventLog }) {
  const hasMissingFields = isLogMissingFields(log);

  return (
    <li className="flex flex-col gap-3 px-5 py-4 transition-all duration-300 ease-in-out hover:bg-white/[0.03] md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 gap-3">
        <CaptureIcon />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Flag Captured
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {log.event || "unknown_event"}
            </span>
            {hasMissingFields ? (
              <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                Warning
              </span>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-slate-200 sm:text-base">
            <span className="font-medium text-slate-300">User </span>
            <span className="font-semibold text-cyan-200">{log.user || "unknown"}</span>
            <span className="font-medium text-slate-300"> captured Flag </span>
            <span className="font-bold text-amber-300">{log.flag || "unknown"}</span>
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
              User ID: {log.user || "missing"}
            </span>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-amber-200">
              Flag #{log.flag || "missing"}
            </span>
          </div>
        </div>
      </div>

      <div className="shrink-0 text-sm text-slate-400">{formatTimestamp(log.timestamp)}</div>
    </li>
  );
}

function appendLogs(currentLogs: EventLog[], incomingLogs: EventLog[]) {
  const currentMap = new Map(currentLogs.map((log) => [getLogKey(log), log]));
  const prependedLogs: EventLog[] = [];

  for (const log of incomingLogs) {
    const key = getLogKey(log);

    if (currentMap.has(key)) {
      continue;
    }

    currentMap.set(key, log);
    prependedLogs.push(log);
  }

  if (prependedLogs.length === 0) {
    return currentLogs;
  }

  return sortLogs([...prependedLogs, ...currentLogs]);
}

function reconcileLogs(serverLogs: EventLog[], currentLogs: EventLog[]) {
  if (serverLogs.length === 0) {
    return [];
  }

  const currentMap = new Map(currentLogs.map((log) => [getLogKey(log), log]));
  const nextLogs = serverLogs.map((log) => {
    const currentLog = currentMap.get(getLogKey(log));

    if (!currentLog) {
      return log;
    }

    return areLogsEqual(currentLog, log) ? currentLog : log;
  });

  if (
    nextLogs.length === currentLogs.length &&
    nextLogs.every((log, index) => log === currentLogs[index])
  ) {
    return currentLogs;
  }

  return sortLogs(nextLogs);
}

function sortLogs(logs: EventLog[]) {
  return [...logs].sort((left, right) => {
    const timestampDelta = Date.parse(right.timestamp) - Date.parse(left.timestamp);

    if (!Number.isNaN(timestampDelta) && timestampDelta !== 0) {
      return timestampDelta;
    }

    return getLogKey(right).localeCompare(getLogKey(left));
  });
}

function getLogKey(log: Pick<EventLog, "_id" | "id">) {
  return log._id || log.id;
}

function areLogsEqual(left: EventLog, right: EventLog) {
  return (
    left._id === right._id &&
    left.id === right.id &&
    left.event === right.event &&
    left.user === right.user &&
    left.flag === right.flag &&
    left.timestamp === right.timestamp
  );
}

function getUserCaptureCounts(logs: EventLog[]) {
  const counts = new Map<string, number>();

  for (const log of logs) {
    counts.set(log.user, (counts.get(log.user) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([user, count]) => ({ user, count }))
    .sort((left, right) => right.count - left.count || left.user.localeCompare(right.user));
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function getConnectionLabel(connectionStatus: ConnectionStatus) {
  if (connectionStatus === "connected") {
    return "Connected";
  }

  return "Disconnected";
}

function getModeLabel(connectionMode: ConnectionMode) {
  if (connectionMode === "sse") {
    return "Live (SSE)";
  }

  return "Polling mode";
}

function isLogMissingFields(log: Partial<EventLog>) {
  return !log.id || !log.event || !log.flag || !log.user || !log.timestamp;
}

function formatEventSummary(log: EventLog) {
  return `${log.event} | User ${log.user} | Flag ${log.flag}`;
}

function extractErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
