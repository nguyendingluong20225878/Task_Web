# Server-only boundary

`src/lib/server/*` contains Node/server-only code. Keep MongoDB, indexer writes,
storage authorization, and server-side chain reads behind this boundary so the
Next.js UI does not import backend infrastructure directly. This folder is the
current staging area for a future BE package or repository.

## MongoDB

The MongoDB read model lives in `src/lib/server/db`. On-chain accounts remain
the source of truth for money, votes, task status, and settlement.

- Use `getMongoDb` and `closeMongoDb` from `src/lib/server/db` in server code.
- Use `upsertTaskFromChain(snapshot)` for task protocol state indexed from
  Solana accounts.
- `upsertTask` and `updateTaskStatus` remain disabled for protocol state.
- Collection helpers are internal implementation details, not FE/client APIs.

Local setup:

```bash
yarn db:init
yarn db:demo
```

## Storage

Storage service integration belongs behind the backend boundary. Browser UI
should not import `services/storage` directly because storage providers may use
Node-only APIs such as filesystem and crypto.

- FE submits task inputs to API routes and receives URI/checksum/proof from BE.
- FE may write the returned public metadata URI and encrypted/private payload
  URI on-chain.
- FE must not read private payload contents directly.

## Future separation

Longer term, the project can split into:

- FE: Next.js UI, wallet adapter, pages/components, and client hooks.
- BE: API server, MongoDB, indexer, storage service, and server-only chain reads.
- Solana: Anchor/Rust program, IDL, tests, and deploy scripts.

`src/lib/solana/client.ts` is currently a mixed client/server chain helper. When
the split happens, separate wallet transaction helpers for FE from read/index
helpers for BE. Treat `target/idl` as a Solana package artifact that should be
shared with FE and BE through an explicit contract artifact path.
