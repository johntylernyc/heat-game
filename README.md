# Heat Game

Web-based multiplayer board game inspired by Heat: Pedal to the Metal.

## Local Development

### Prerequisites

- Node.js 22+
- npm

### Install dependencies

```bash
npm install
```

### Start the WebSocket server

```bash
npm start
```

This starts the Heat WebSocket server on `ws://localhost:3000`.

To use a different port:

```bash
PORT=9000 npm start
```

### Start with file watching (auto-restart on changes)

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run tests

```bash
npm test
```

## Connecting a client

The server uses WebSocket protocol. Connect to `ws://localhost:3000` (or your configured port) and send JSON messages:

```json
{ "type": "create-room", "trackId": "usa", "lapCount": 2, "maxPlayers": 4, "displayName": "Alice" }
```

The server responds with `session-created` on connect, then `room-created` after creating a room with a 6-character room code other players can use to join.
