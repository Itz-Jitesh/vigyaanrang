import { NextResponse } from "next/server";

import type { EventPayload, EventType } from "@/lib/events";
import { addLog, clearLogs, getLogs } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENT_TYPES: EventType[] = ["flag_captured"];

export async function GET() {
  try {
    const logs = await getLogs();
    return NextResponse.json({ success: true, logs }, { status: 200 });
  } catch (error) {
    console.error("GET /api/events failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch (error) {
      console.error("POST /api/events invalid JSON:", error);
      return NextResponse.json(
        { success: false, error: "Invalid payload" },
        { status: 400 },
      );
    }

    console.log("EVENT RECEIVED:", JSON.stringify(body, null, 2));

    const validation = validatePayload(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid payload" },
        { status: 400 },
      );
    }

    const log = await addLog(validation.data);

    return NextResponse.json({ success: true, log }, { status: 200 });
  } catch (error) {
    console.error("POST /api/events failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    await clearLogs();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/events failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

function validatePayload(body: unknown):
  | { success: true; data: EventPayload }
  | { success: false } {
  const source =
    Array.isArray(body) && body.length > 0
      ? body[0]
      : body && typeof body === "object"
        ? body
        : null;

  if (!source || typeof source !== "object") {
    return { success: false };
  }

  const record = source as Record<string, unknown>;
  const log = record.log;

  if (!log || typeof log !== "object") {
    return { success: false };
  }

  const candidate = log as Record<string, unknown>;
  const id = normalizeRequiredString(candidate.id);
  const event = normalizeEvent(candidate.event);
  const flag = normalizeRequiredString(candidate.flag);
  const user = normalizeRequiredString(candidate.user);
  const timestamp = normalizeTimestamp(candidate.timestamp);

  if (!id || !event || !flag || !user || !timestamp) {
    return { success: false };
  }

  return {
    success: true,
    data: {
      id,
      event,
      flag,
      user,
      timestamp,
    },
  };
}

function normalizeRequiredString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEvent(value: unknown): EventType | null {
  if (typeof value !== "string" || !EVENT_TYPES.includes(value as EventType)) {
    return null;
  }

  return value as EventType;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return Number.isNaN(Date.parse(value)) ? null : value;
}
