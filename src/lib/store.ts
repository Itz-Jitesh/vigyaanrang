import "server-only";

import type { Collection, ObjectId } from "mongodb";

import type { EventLog, EventPayload, StreamMessage } from "@/lib/events";
import { getLogsCollection } from "@/lib/mongodb";

type Listener = (message: StreamMessage) => void;

declare global {
  var __ctfEventListeners: Set<Listener> | undefined;
}

type EventLogDocument = Omit<EventLog, "_id"> & {
  _id?: ObjectId;
};

const listeners = globalThis.__ctfEventListeners ?? new Set<Listener>();

globalThis.__ctfEventListeners = listeners;

export async function getLogs(): Promise<EventLog[]> {
  const collection = await getEventLogsCollection();
  const logs = await collection
    .find({}, { sort: { timestamp: -1, _id: -1 } })
    .toArray();

  console.log("Fetched logs from DB");
  return logs.map(mapEventLogDocument);
}

export async function getLastLog(): Promise<EventLog | null> {
  const collection = await getEventLogsCollection();
  const log = await collection.findOne({}, { sort: { timestamp: -1, _id: -1 } });

  if (!log) {
    return null;
  }

  return mapEventLogDocument(log);
}

export async function addLog(payload: EventPayload): Promise<EventLog> {
  const collection = await getEventLogsCollection();
  const log = {
    id: payload.id,
    event: payload.event,
    flag: payload.flag,
    user: payload.user,
    timestamp: payload.timestamp,
  };

  const { insertedId } = await collection.insertOne(log);
  const insertedLog: EventLog = {
    _id: insertedId.toHexString(),
    ...log,
  };

  console.log("Log inserted into DB");
  emit({ type: "event", payload: insertedLog });

  return insertedLog;
}

export async function clearLogs(): Promise<void> {
  const collection = await getEventLogsCollection();
  await collection.deleteMany({});
  emit({ type: "clear" });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function emit(message: StreamMessage): void {
  for (const listener of listeners) {
    listener(message);
  }
}

async function getEventLogsCollection(): Promise<Collection<EventLogDocument>> {
  return getLogsCollection<EventLogDocument>();
}

function mapEventLogDocument(log: EventLogDocument): EventLog {
  if (!log._id) {
    throw new Error("Log document is missing _id");
  }

  return {
    _id: log._id.toHexString(),
    id: log.id,
    event: log.event,
    user: log.user,
    flag: log.flag,
    timestamp: log.timestamp,
  };
}
