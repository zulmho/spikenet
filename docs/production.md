# SpikeNet Production Checklist

## Environment

Copy `.env.example` to `.env` on the server and set real values. In production:

- `NODE_ENV=production`
- `JWT_SECRET` must be unique and at least 32 characters
- `DB_PASSWORD` must be set
- `APP_URL` should point to the public domain
- `TRUST_PROXY=true` when running behind Nginx, Caddy, Render, Railway, Fly or another proxy

Run:

```bash
npm run prod:check
```

## Database

Run migrations before starting the app:

```bash
npm run migrate
```

Create backups with:

```bash
npm run db:backup
```

The command uses `pg_dump` and writes `.sql` files into `BACKUP_DIR`.

## Security Defaults

The app now has:

- HTTP security headers
- request ids in every API response
- global, auth, write and upload rate limits
- strict production env validation
- safer upload size configuration
- normalized API error payloads

## Deploy Flow

1. Install dependencies: `npm ci --omit=dev`
2. Set environment variables
3. Run `npm run migrate`
4. Run `npm run prod:check`
5. Start with `npm start`
