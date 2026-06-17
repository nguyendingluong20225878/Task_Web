# FULL LIFECYCLE EXECUTION

## Environment

- Date: 2026-05-30
- Mode requested: execute only, no dry-run
- Local validator RPC: `http://127.0.0.1:8899`
- MongoDB: external MongoDB from `MONGODB_URI` in `.env`
- Metaplex Core program: `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`
- Environment readiness from operator terminal:
  - MongoDB ping OK for database `Task_web`
  - Solana RPC ping OK
  - Metaplex Core program executable and owned by `BPFLoaderUpgradeab1e11111111111111111111111`
  - `npm run dev:full` reported `All services are ready`

## Phase 1 -> 6 Logs

Execution did not reach Phase 1 from the Codex runtime channel.

Reason: every attempt to invoke WSL from Codex failed before entering the project shell:

```text
Wsl/Service/0x8007274c
A connection attempt failed because the connected party did not properly respond after a period of time,
or established connection failed because connected host has failed to respond.
```

This is an operator-channel failure, not a Solana transaction failure. The user's WSL terminal is still able to run project commands, as shown by the successful `npm run dev:full` output.

### Commands to execute in the working WSL terminal

These commands are execute-mode commands. They do not use dry-run.

```bash
cd ~/task_web

npm run dev:full
node scripts/setup-create-task-prereqs.js

TASK_ID="$(date +%s)"
SUBMISSION_URI="enc://runtime-submit-${TASK_ID}"

node scripts/create-task.js \
  --mode=execute \
  --id="$TASK_ID"

node scripts/phase2-stake.js \
  --mode=execute \
  --task-id="$TASK_ID"

node scripts/phase3-submit.js \
  --mode=execute \
  --task-id="$TASK_ID" \
  --encrypted-submission-uri="$SUBMISSION_URI"

node scripts/phase3-init-judge-assignment.js \
  --mode=execute \
  --task-id="$TASK_ID"

ANCHOR_WALLET=.anchor/judge-1.json node scripts/phase4-vote.js \
  --mode=execute \
  --task-id="$TASK_ID" \
  --vote=pass

node scripts/phase5-settle.js \
  --mode=execute \
  --task-id="$TASK_ID" \
  --worker-token-account="$CREATE_TASK_CREATOR_TOKEN_ACCOUNT" \
  --requestor-token-account="$CREATE_TASK_CREATOR_TOKEN_ACCOUNT"

ANCHOR_WALLET=.anchor/judge-1.json node scripts/phase5-claim-judge-fee.js \
  --mode=execute \
  --task-id="$TASK_ID" \
  --judge-token-account="$CREATE_TASK_CREATOR_TOKEN_ACCOUNT"
```

Important signer note:

- `scripts/setup-create-task-prereqs.js` registers judge keypair `.anchor/judge-1.json`.
- Vote and claim must therefore run with `ANCHOR_WALLET=.anchor/judge-1.json`.
- Create, stake, submit, and settle use the default Anchor wallet unless explicitly overridden.

## Balance Changes

Not captured because Phase 1 did not execute from the Codex runtime channel.

Required tracking points for the successful terminal run:

```bash
solana balance --url http://127.0.0.1:8899
spl-token account-info "$CREATE_TASK_CREATOR_TOKEN_ACCOUNT" --url http://127.0.0.1:8899
```

After Phase 1, capture the escrow vault from `create-task.js` output and track it:

```bash
spl-token account-info "<ESCROW_VAULT>" --url http://127.0.0.1:8899
```

Track the same balances before and after every phase:

- creator token account
- worker token account
- judge token account
- escrow vault

## Errors

### Blocking error

Codex could not invoke WSL to run the lifecycle commands:

```text
Wsl/Service/0x8007274c
```

### Not observed

No transaction failure, simulation failure, or balance mismatch was observed because no lifecycle transaction was submitted from the Codex runtime channel.

## Money Flow Check

Not executed.

Expected final checks after a successful execute run:

- Escrow vault balance is `0` after settlement and judge fee claim.
- Worker receives the approved bounty amount minus reserved judge fee, according to contract rules.
- Judge receives `feePerJudge`.
- `totalJudgeFeeReserved` and `judgeFeeClaimed` reconcile.
- No SPL token funds remain stuck in the task escrow vault.

## Final Verdict

FAILED

Reason: the lifecycle was not executed because the Codex runtime channel could not connect to WSL. This report does not claim successful E2E execution and does not include fabricated tx signatures.
