import { NextResponse } from "next/server";

import { addLog, clearLogs, getLogs, type EventPayload, type EventType } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENT_TYPES: EventType[] = ["flag_captured"];

export async function GET() {
  return NextResponse.json({ logs: getLogs() });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const validation = validatePayload(payload);

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const log = addLog(validation.data);

  return NextResponse.json({ success: true, log }, { status: 201 });
}

export async function DELETE() {
  clearLogs();

  return NextResponse.json({ success: true });
}

function validatePayload(payload: unknown):
  | { success: true; data: EventPayload }
  | { success: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { success: false, error: "Payload must be a JSON object." };
  }

  const { event, user, flag, timestamp } = payload as Record<string, unknown>;

  if (typeof event !== "string" || !EVENT_TYPES.includes(event as EventType)) {
    return {
      success: false,
      error: "event must be flag_captured.",
    };
  }

  const normalizedUser = normalizeId(user);
  const normalizedFlag = normalizeId(flag);

  if (!normalizedUser) {
    return { success: false, error: "user is required." };
  }

  if (!normalizedFlag) {
    return { success: false, error: "flag is required." };
  }

  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    return { success: false, error: "timestamp must be a valid date string." };
  }

  return {
    success: true,
    data: {
      event: event as EventType,
      user: normalizedUser,
      flag: normalizedFlag,
      timestamp,
    },
  };
}

function normalizeId(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}
