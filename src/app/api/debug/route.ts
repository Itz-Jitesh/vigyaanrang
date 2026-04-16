import { NextResponse } from "next/server";

import { getLastLog, getLogs } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const logs = getLogs();

    return NextResponse.json(
      {
        totalLogs: logs.length,
        lastLog: getLastLog(),
        serverTime: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/debug failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
