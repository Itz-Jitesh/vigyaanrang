import type { StreamMessage } from "@/lib/events";
import { subscribe } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export async function GET(request: Request) {
  console.log("SSE client connected");
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const push = (message: string) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(message));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) {
          return;
        }

        console.log("SSE client disconnected");
        closed = true;
        unsubscribe?.();

        if (heartbeat) {
          clearInterval(heartbeat);
        }

        try {
          controller.close();
        } catch {
          // Connection is already closed.
        }
      };

      push("retry: 3000\n\n");

      unsubscribe = subscribe((message: StreamMessage) => {
        console.log("SSE EVENT SENT:", message);
        push(`data: ${JSON.stringify(message)}\n\n`);
      });

      heartbeat = setInterval(() => {
        push(": keepalive\n\n");
      }, 15000);

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (closed) {
        return;
      }

      closed = true;
      unsubscribe?.();

      if (heartbeat) {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
