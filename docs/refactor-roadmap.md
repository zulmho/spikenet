# SpikeNet Refactor Roadmap

## Done

1. Cleaned accidental Vite duplicates from `public/js`.
2. Moved telemetry schema into `migrations/004_telemetry.sql`.
3. Removed market runtime schema creation from `src/routes/marketRoutes.js`.
4. Moved admin seed/sync into `migrations/005_admin_seed.sql`.
5. Removed runtime `ALTER TABLE` calls from DM, lobby, sockets and game sync.
6. Added boot database checks in `src/services/bootCheck.js`.
7. Ran full integration API coverage for market deal, dispute moderation and direct chat controls.
8. Added `tests/runtimeSchema.test.js` to keep schema changes inside migrations.

## Required Checks

Run these after backend or migration changes:

```bash
npm run migrate
npm test
npm run test:integration
npm run build:react-modules
npm audit --omit=dev
```

Before deployment:

```bash
npm run prod:check
npm run db:backup
```

`prod:check` intentionally fails if `.env` still uses a weak `JWT_SECRET`.

## Next Stages

1. Split `src/routes/marketRoutes.js` into focused route modules:
   - listings
   - trades
   - wallet
   - disputes
   - sellers
   - moderation

2. Move market business logic into services:
   - `marketWalletService`
   - `marketTradeService`
   - `marketDisputeService`
   - `marketSellerService`

3. Split frontend market code:
   - `marketApi`
   - `marketListings`
   - `marketTrades`
   - `marketWallet`
   - `marketModals`

4. Rebuild Social Hub as one shared chat/group core:
   - one message renderer
   - one composer
   - one attachment preview
   - one pin/search/reaction layer

5. Gradually move real screens to React:
   - telemetry/settings first
   - market second
   - social hub third
   - full layout last
