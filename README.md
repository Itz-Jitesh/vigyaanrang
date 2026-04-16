# Real-time CTF Event Dashboard (n8n Webhooks)

Next.js (App Router) dashboard that receives webhook events from **n8n**, stores them **in-memory** (max **200**, newest-first), and updates the UI automatically using:

- **SSE (Server-Sent Events)** when available
- **Polling fallback (every 2 seconds)** for tunnel environments (Cloudflare / ngrok) where SSE can be unreliable

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Webhook payload format (MUST MATCH)

The app accepts either:

- **Array of objects** (n8n typical):

```json
[
  {
    "success": true,
    "log": {
      "id": "uuid",
      "event": "flag_captured",
      "flag": "45",
      "user": "123",
      "timestamp": "2026-04-16T13:40:00Z"
    }
  }
]
```

- **Single object**:

```json
{
  "success": true,
  "log": {
    "id": "uuid",
    "event": "flag_captured",
    "flag": "45",
    "user": "123",
    "timestamp": "2026-04-16T13:40:00Z"
  }
}
```

### Validation rules

The server extracts `body[0].log` (array) or `body.log` (object) and requires:

- `id` (string)
- `event` (string, must be `flag_captured`)
- `flag` (string)
- `user` (string)
- `timestamp` (string, must parse as a valid date)

Invalid requests return:

```json
{ "success": false, "error": "Invalid payload" }
```

## API routes

### `POST /api/events`

Receives webhook events and stores them in the global in-memory store.

- **Success**: `200` → `{ success: true, log }`
- **Invalid payload**: `400` → `{ success: false, error: "Invalid payload" }`
- **Server error**: `500` → `{ success: false, error: "Internal server error" }`

Server logs:

- `EVENT RECEIVED: <payload>`

### `GET /api/events`

Returns all logs (newest first):

```json
{ "success": true, "logs": [ ... ] }
```

### `DELETE /api/events`

Clears all logs:

```json
{ "success": true }
```

### `GET /api/stream`

SSE endpoint that streams realtime events to the UI.

Headers:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

Server logs:

- `SSE client connected`
- `SSE EVENT SENT: <payload>`
- `SSE client disconnected`

### `GET /api/debug`

Returns a quick snapshot of server state:

```json
{
  "totalLogs": 12,
  "lastLog": { "...": "..." },
  "serverTime": "2026-04-16T14:15:34.789Z"
}
```

## Dashboard behavior (real-time updates)

The UI is designed to update without refresh.

- **Polling is always running** every 2 seconds to keep the UI updated even if SSE breaks behind a tunnel.
- **SSE is attempted** as a best-effort enhancement.
- If SSE errors, the UI continues to update via polling.

In the browser console you’ll see debug output:

- `RENDER: <logs.length>`
- `API CALL: <url> <body>`
- `Polling fetch triggered`
- `SSE connecting...`
- `SSE connected`
- `SSE message: <data>`
- `SSE error`
- `SETTING LOGS: <newLogs>`

The dashboard includes a visible debug panel showing:

- logs count
- last received event
- connection status (`connected` / `disconnected`)
- connection mode (`Live (SSE)` / `Polling mode`)
- last API error

## Manual testing (copy/paste)

### Send a valid event (array payload)

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  --data '[{"success":true,"log":{"id":"uuid","event":"flag_captured","flag":"45","user":"123","timestamp":"2026-04-16T13:40:00Z"}}]'
```

### Send an invalid event

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  --data '[{"success":true,"log":{"id":"broken"}}]'
```

### Clear logs

```bash
curl -s -X DELETE http://localhost:3000/api/events
```

### Watch SSE output locally

```bash
curl -N http://localhost:3000/api/stream
```

## Tunnels (Cloudflare / ngrok)

SSE can be disrupted by some proxies (buffering, idle timeouts, HTTP/2 quirks).
This app is designed to remain usable in those environments by keeping **polling enabled** at all times.

If you want to disable SSE entirely and run purely in “failsafe” polling mode, set:

- `ENABLE_SSE = false` in `src/app/page.tsx`

## Project layout

- `src/app/page.tsx`: dashboard UI + debug panel + SSE + polling
- `src/app/api/events/route.ts`: validated webhook ingestion + in-memory storage
- `src/app/api/stream/route.ts`: SSE stream
- `src/app/api/debug/route.ts`: server debug snapshot
- `src/lib/store.ts`: global in-memory log store (max 200, newest-first)
