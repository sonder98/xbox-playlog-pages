// The old standalone backfill used a stale Git bootstrap and could discard the
// playtime ledger. All artwork refreshes now use the authoritative sync.
throw Error('Use the official sync workflow (sync.yml) to refresh AU artwork.');
