# SpikeNet Database Workflow

## Migrations

Run all pending migrations:

```bash
npm run migrate
```

Migrations live in `migrations/` and are applied in filename order. Applied files are tracked in `schema_migrations`.

The old `ensure*Schema` helpers still exist as a development safety net, but new schema changes should go into a migration first.

## Demo Seed

Fill a local database with demo users, listings, a chat and a group:

```bash
npm run seed
```

Demo users:

- `zulamho`
- `Ing1`
- `gamer50`
- `Ibra`

Password for all demo users:

```text
demo12345
```

## Tests

Fast unit tests:

```bash
npm test
```

Integration tests against a real database:

```bash
npm run migrate
npm run test:integration
```

Integration tests create temporary users and remove them after the run. Use a test database when possible.
