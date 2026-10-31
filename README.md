# livepoll

Create polls and see the results live (Express + WebSocket + SQLite back, React + Vite front).

## Development

```bash
cd back && npm install && npm start      # API + WebSocket on :6678
cd front && npm install && npm run dev   # Vite on :6677, /api is proxied to :6678
```

## Production

Never expose `npm run dev` (the Vite dev server) to the Internet: it serves the source tree and has had
several arbitrary file read vulnerabilities. Build the front and let the back serve it:

```bash
cd front && npm ci && npm run build      # outputs front/dist
cd back && npm ci && npm start           # serves front/dist + /api on :6678
```

Then point the reverse proxy / tunnel for the whole domain to `:6678` (WebSocket upgrades must be allowed on `/api`).

Environment variables (back):

| Variable | Default | |
|---|---|---|
| `PORT` | `6678` | |
| `DB_PATH` | `./db` | SQLite file |
| `FRONT_DIST` | `../front/dist` | served if it exists |
