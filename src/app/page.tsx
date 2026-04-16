"use client";

import { useEffect, useRef, useState } from "react";

import type { EventLog, StreamMessage } from "@/lib/store";

type ConnectionState = "connecting" | "live" | "reconnecting";

export default function Home() {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const listRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const totalFlagsCaptured = logs.length;
  const userCaptureCounts = getUserCaptureCounts(logs);

  useEffect(() => {
    void fetchLogs();

    const eventSource = new EventSource("/api/stream");

    eventSource.onopen = () => {
      setConnectionState("live");
      void fetchLogs(false);
    };

    eventSource.onmessage = (event) => {
      const message = JSON.parse(event.data) as StreamMessage;

      if (message.type === "clear") {
        setLogs([]);
        return;
      }

      setLogs((currentLogs: EventLog[]) => mergeLogs([message.payload], currentLogs));
    };

    eventSource.onerror = () => {
      setConnectionState("reconnecting");
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    const container = listRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: 0,
      behavior: hasLoadedRef.current ? "smooth" : "auto",
    });

    hasLoadedRef.current = true;
  }, [logs]);

  async function fetchLogs(showLoader = true) {
    if (showLoader) {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/events", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Unable to load events.");
      }

      const data = (await response.json()) as { logs: EventLog[] };
      setLogs(data.logs);
      setError(null);
    } catch {
      setError("Unable to load events.");
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }

  async function handleClearLogs() {
    if (isClearing) {
      return;
    }

    const previousLogs = logs;
    setIsClearing(true);
    setLogs([]);
    setError(null);

    try {
      const response = await fetch("/api/events", { method: "DELETE" });

      if (!response.ok) {
        throw new Error("Unable to clear logs.");
      }
    } catch {
      setLogs(previousLogs);
      setError("Unable to clear logs.");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_50%,_#020617_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="flex flex-col gap-5 border-b border-white/10 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    connectionState === "live"
                      ? "bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.7)]"
                      : "bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.55)]"
                  }`}
                />
                {getConnectionLabel(connectionState)}
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  CTF Event Dashboard
                </h1>
                <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
                  Live flag submission events streamed over SSE and stored in memory until the
                  server restarts.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearLogs}
              disabled={isClearing || (!isLoading && logs.length === 0)}
              className="inline-flex items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-100 transition duration-200 hover:border-rose-300/40 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isClearing ? "Clearing..." : "Clear Logs"}
            </button>
          </div>

          <div className="grid gap-4 border-b border-white/10 px-6 py-4 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Captured Flags" value={String(totalFlagsCaptured)} />
            <StatCard label="Retention" value="200 max" />
            <StatCard label="Transport" value="Server-Sent Events" />
            <StatCard
              label="Most Active User"
              value={userCaptureCounts[0] ? `User ${userCaptureCounts[0].user}` : "No captures"}
            />
          </div>

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
                      <li
                        key={log.id}
                        className="flex flex-col gap-3 px-5 py-4 transition duration-200 hover:bg-white/[0.03] md:flex-row md:items-start md:justify-between"
                      >
                        <div className="flex min-w-0 gap-3">
                          <CaptureIcon />
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                                Flag Captured
                              </span>
                              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                {log.event}
                              </span>
                            </div>
                            <p className="text-sm leading-6 text-slate-200 sm:text-base">
                              <span className="font-semibold text-cyan-200">User {log.user}</span>{" "}
                              captured{" "}
                              <span className="font-semibold text-amber-300">Flag {log.flag}</span>
                            </p>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                                User ID: {log.user}
                              </span>
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-amber-200">
                                Flag #{log.flag}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-sm text-slate-400">
                          {formatTimestamp(log.timestamp)}
                        </div>
                      </li>
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

function mergeLogs(incomingLogs: EventLog[], currentLogs: EventLog[]) {
  const map = new Map<string, EventLog>();

  for (const log of incomingLogs) {
    map.set(log.id, log);
  }

  for (const log of currentLogs) {
    if (!map.has(log.id)) {
      map.set(log.id, log);
    }
  }

  return Array.from(map.values()).slice(0, 200);
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

function getConnectionLabel(connectionState: ConnectionState) {
  if (connectionState === "live") {
    return "Live";
  }

  if (connectionState === "reconnecting") {
    return "Reconnecting";
  }

  return "Connecting";
}
