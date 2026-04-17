# Vidyarang

A Next.js 16 dashboard for monitoring CTF flag capture events in real time. The app accepts webhook payloads, stores them in MongoDB, streams new events over SSE, and falls back to polling in the browser when the live stream drops.

## Event dashboard

This project was used as a live dashboard for an event setup. It ties together event activity coming from the core flagging workflow, automation, and webhook delivery into a single real-time view for operators.

## Ownership

- `Me(@Itz-Jitesh)` handled the n8n + dashboard part
- `Benjamin(@bchbenjamin)` handled the core Ubuntu flagging part
- `C Yogeetha(@gitGojo)` handled the Discord webhook part

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- MongoDB Node.js driver

## Current behavior

- Receives flag capture events at `POST /api/events`
- Persists logs in MongoDB collection `logs`
- Streams new inserts to connected clients through `GET /api/stream`
- Falls back to polling `GET /api/events` every 5 seconds if SSE disconnects
- Shows a live event feed, per-user capture totals, connection state, debug cards, toast alerts, and a notification sound
- Supports clearing all stored logs from the UI or via `DELETE /api/events`

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Add a MongoDB connection string in `.env.local` or `.env`:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>
```

3. Start the dev server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Available scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Webhook payload format

The API accepts either an array payload or a single object payload. In both cases the route reads `log` and validates these fields:

- `id`: non-empty string
- `event`: must be `flag_captured`
- `flag`: non-empty string
- `user`: non-empty string
- `timestamp`: valid date string

Array form:

```json
[
  {
    "success": true,
    "log": {
      "id": "demo-webhook-event",
      "event": "flag_captured",
      "flag": "45",
      "user": "123",
      "timestamp": "2026-04-16T13:40:00Z"
    }
  }
]
```

Object form:

```json
{
  "success": true,
  "log": {
    "id": "demo-webhook-event",
    "event": "flag_captured",
    "flag": "45",
    "user": "123",
    "timestamp": "2026-04-16T13:40:00Z"
  }
}
```

Invalid requests return:

```json
{ "success": false, "error": "Invalid payload" }
```

## API routes

### `GET /api/events`

Returns all logs sorted newest first:

```json
{
  "success": true,
  "logs": [
    {
      "_id": "6800f3d6a0f5f2d8d91e3c1a",
      "id": "demo-webhook-event",
      "event": "flag_captured",
      "flag": "45",
      "user": "123",
      "timestamp": "2026-04-16T13:40:00Z"
    }
  ]
}
```

### `POST /api/events`

Validates the payload, inserts it into MongoDB, and returns the stored log including the generated MongoDB `_id`.

Success response:

```json
{
  "success": true,
  "log": {
    "_id": "6800f3d6a0f5f2d8d91e3c1a",
    "id": "demo-webhook-event",
    "event": "flag_captured",
    "flag": "45",
    "user": "123",
    "timestamp": "2026-04-16T13:40:00Z"
  }
}
```

### `DELETE /api/events`

Deletes all stored logs:

```json
{ "success": true }
```

### `GET /api/stream`

SSE endpoint used by the dashboard for live updates.

- Sends event messages as `data: {...}`
- Sends `clear` messages after log deletion
- Sends keepalive comments every 15 seconds
- Sets `retry: 3000` for client reconnect behavior

Message examples:

```json
{ "type": "event", "payload": { "...": "..." } }
```

```json
{ "type": "clear" }
```

### `GET /api/debug`

Returns a lightweight snapshot of server state:

```json
{
  "totalLogs": 12,
  "lastLog": {
    "_id": "6800f3d6a0f5f2d8d91e3c1a",
    "id": "demo-webhook-event",
    "event": "flag_captured",
    "flag": "45",
    "user": "123",
    "timestamp": "2026-04-16T13:40:00Z"
  },
  "serverTime": "2026-04-17T16:30:00.000Z"
}
```

## UI features

- `Test API` button posts a sample event to `POST /api/events`
- `Clear Logs` button deletes all logs
- Toast notifications appear for newly received events
- `/public/beep.wav` is played when a new event arrives
- The dashboard tracks:
  - total captured flags
  - connection status
  - active transport mode
  - most active user
  - last received event
  - last API error

## MongoDB notes

- The app requires `MONGODB_URI`
- It creates or reuses the `logs` collection automatically
- Logs are stored permanently in MongoDB until deleted; there is no in-app retention cap
- MongoDB connections are cached globally to avoid reconnecting on every request

## Manual testing

Send a valid event:

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  --data '[{"success":true,"log":{"id":"demo-webhook-event","event":"flag_captured","flag":"45","user":"123","timestamp":"2026-04-16T13:40:00Z"}}]'
```

Fetch logs:

```bash
curl -s http://localhost:3000/api/events
```

Clear logs:

```bash
curl -s -X DELETE http://localhost:3000/api/events
```

Watch the SSE stream:

```bash
curl -N http://localhost:3000/api/stream
```

## Project structure

- `src/app/page.tsx`: dashboard UI, SSE client, polling fallback, toast notifications
- `src/app/api/events/route.ts`: log ingestion, listing, and clearing
- `src/app/api/stream/route.ts`: SSE stream endpoint
- `src/app/api/debug/route.ts`: debug snapshot endpoint
- `src/lib/store.ts`: MongoDB-backed log store and event subscriptions
- `src/lib/mongodb.ts`: MongoDB connection and collection setup
- `src/lib/events.ts`: shared event and stream types
- `public/beep.wav`: notification sound used by the dashboard
