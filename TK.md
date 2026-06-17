# TASK SYSTEM - FINAL DOCUMENT

## 1. System Overview

Task System là hệ thống task marketplace có lõi tin cậy nằm trên smart contract. Toàn bộ lifecycle của task, escrow, stake, vote và settlement phải được xác định bởi on-chain state. Atlas DB chỉ đóng vai trò read model, transaction log, simulation log và operational cache.

Hệ thống được thiết kế theo mô hình hybrid backend-centric với on-chain trust core:

- Smart contract quản lý tiền, trạng thái protocol, kiểm tra quyền hạn và settlement cuối cùng.
- Backend validate request, chuẩn hóa input, dựng transaction context, phối hợp storage và ghi nhận metadata thực thi.
- Indexer đọc account/event đã confirm/finalize từ chain và ghi snapshot canonical vào Atlas.
- Storage lưu public metadata, encrypted task detail và encrypted submission; quyền đọc private data chỉ được cấp khi có bằng chứng từ chain hoặc indexed proof hợp lệ.
- Frontend/API không được xem DB là nguồn sự thật cuối cùng cho protocol state.

Các actor chính:

- Requestor: tạo task và fund bounty.
- Worker: stake để unlock task detail, thực hiện công việc và submit encrypted deliverable.
- Judge: vote pass/fail cho submission nếu được assign.
- Keeper/Admin: thực hiện maintenance action như retry assignment, settle, cancel hoặc claim orchestration khi protocol cho phép.

Các record/account cốt lõi:

- On-chain: `Task`, `WorkerEscrow`, `TaskJudgeAssignment`, `JudgeRecord` / `JudgeRegistry`, `EscrowTokenVault`.
- Atlas: `tasks`, `judge_assignments`, `transactions`, `transaction_intents`, `worker_escrows`, `settlements`, `storage_objects`.
- Storage: immutable URI/hash cho metadata, task detail, submission và vote metadata.

## 2. Full Lifecycle (Phase 1 → 5)

### Phase 1: Create Task

Requestor tạo task và chuyển bounty vào task bounty escrow vault. Task bắt đầu ở trạng thái `Open`.

Đặc điểm đã có từ Phase 1:

- Mỗi phase hỗ trợ `dry-run` và `execute`.
- `dry-run` không gửi on-chain transaction.
- `dry-run` vẫn ghi Atlas record với `isSimulated = true`.
- `execute` gửi Anchor transaction thật, confirm signature, fetch state sau transaction và ghi dữ liệu xác nhận.
- On-chain program state là source of truth.

Money effect:

```text
Requestor Token Account
  -- bounty_amount -->
Task Bounty Escrow Vault

Task status:
  none -> Open
```

### Phase 2: Stake

Worker stake để nhận task. Task chuyển từ `Open` sang `InProgress`.

Validation chính:

- Task tồn tại và đang `Open`.
- Worker chưa được assign.
- Stake amount khớp requirement của task.
- Source account thuộc worker.
- Asset/mint đúng policy.
- Task chưa hết hạn nhận worker nếu có acceptance deadline.

State transition:

```text
Open -- stake_to_unlock --> InProgress
```

Money effect:

```text
Worker Stake Source Account
  -- worker_stake_amount -->
Worker Stake Escrow
```

Race condition phải được xử lý on-chain: nếu nhiều worker stake cùng lúc, transaction confirm đầu tiên thắng; các transaction sau phải bị reject vì task không còn `Open`.

### Phase 3: Submit

Worker submit encrypted deliverable và đưa task sang phase resolution.

Validation chính:

- Task đang `InProgress`.
- Caller là `Task.worker`.
- Submission trước `submissionDeadline`.
- Encrypted submission đã upload trước khi build transaction.
- URI/hash trên chain trỏ đến object immutable và khớp content hash.

State transition:

```text
InProgress -- submit_and_assign --> Resolving
```

Money effect:

```text
No token transfer expected.
Bounty remains in task escrow.
Worker stake remains locked.
```

Nếu upload storage thành công nhưng transaction fail/expire, object đó là orphan. Orphaned private object không được cấp quyền đọc và cần cleanup theo retention policy.

### Phase 4: Judge Vote

Assigned judge vote `pass` hoặc `fail`. Vote cập nhật assignment state và vote counters của task. Phase này không di chuyển tiền.

Validation chính:

- Task đang `Resolving`.
- Judge assignment tồn tại.
- Judge được assign cho task.
- Judge chưa vote.
- Vote trước `votingDeadline`.
- Judge active theo policy của protocol.
- Judge không được là requestor/worker nếu protocol cấm.

State transition:

```text
Resolving -- judge_vote --> Resolving
```

Money effect:

```text
No token transfer expected.
Bounty remains in escrow.
Worker stake remains locked.
Judge fee is not paid during vote.
```

Vote chỉ tạo bằng chứng cho settlement. Double vote và unassigned vote phải bị chặn on-chain.

### Phase 5: Settle

Keeper/authority finalize outcome và di chuyển tiền từ escrow theo kết quả vote.

Validation chính:

- Task đang `Resolving`.
- Outcome đã mathematically decisive, hoặc protocol có no-quorum policy rõ ràng.
- Settlement chưa từng chạy.
- Token accounts đúng owner/mint.
- Vault balances đủ.
- Fee math không vượt escrow balance.

Điều kiện approved:

```text
pass_vote_count >= approval_threshold_n
```

Điều kiện rejected:

```text
fail_vote_count > required_judges_m - approval_threshold_n
```

No-quorum/inconclusive:

```text
pass_vote_count < approval_threshold_n
and
fail_vote_count <= required_judges_m - approval_threshold_n
and
votingDeadline has passed
```

State transitions:

```text
Resolving -- settle_payment approved --> Completed
Resolving -- settle_payment rejected --> Failed
Resolving -- settle_payment no-quorum --> Inconclusive or rejected transaction
```

Theo QA, no-quorum chưa có money policy terminal đầy đủ. Implementation hiện nên reject settlement trong no-quorum thay vì tự map sang `Failed`.

## 3. Architecture Summary

### On-chain responsibilities

Smart contract sở hữu toàn bộ protocol-critical truth:

- Task lifecycle state.
- Bounty escrow custody.
- Worker stake custody.
- Worker identity của task.
- Submission state transition.
- Judge assignment validity.
- Vote validity và vote counters.
- Settlement decision.
- Token transfers.
- Judge fee reservation/claim constraints.
- Chống double action: double stake, double submit, double vote, double settle, double judge fee claim.
- Token account constraints: owner, mint, vault authority, PDA seeds.

Contract phải reject sai state, sai actor, sai mint/owner, unassigned vote, duplicate vote, premature settlement, no-quorum settlement nếu chưa support, repeated settlement và unauthorized admin/cancel action.

### Backend responsibilities

Backend cải thiện UX và operational safety, nhưng không được trở thành protocol authority.

Backend chịu trách nhiệm:

- Validate request shape.
- Normalize phase params.
- Build transaction context.
- Refetch/stale-state check trước risky action.
- Coordinate storage upload cho create/submit.
- Ghi transaction intents riêng với final indexed state.
- Ghi dry-run với `isSimulated = true`.
- Ghi execute metadata: submitted/confirmed/error.
- Expose read API từ Atlas cache.
- Chuẩn hóa error taxonomy.

Backend không được:

- Tự đánh dấu final task status là authoritative.
- Mở khóa private content chỉ dựa vào DB-only proof.
- Tự quyết định final settlement payout.
- Mutate indexed protocol state nếu thiếu chain slot/signature/commitment.
- Che giấu failed/inconclusive settlement bằng DB write thành công.

### Indexer responsibilities

Indexer là canonical writer cho confirmed/finalized read-model snapshots.

Indexer cần:

- Theo dõi `Task`, `WorkerEscrow`, `JudgeRecord`, `TaskJudgeAssignment`, `SystemConfig` và vault accounts khi cần.
- Decode account.
- Upsert Atlas record với PDA, slot, signature, commitment, program id, decoded payload và timestamp.
- Mark transaction intents thành observed, confirmed, failed hoặc stale.
- Reconcile vault balances và DB snapshots.
- Hỗ trợ rebuild từ deployment slot.

Indexer phải idempotent: duplicate event không tạo duplicate record, lower-slot snapshot không overwrite newer snapshot, repeated transaction observation phải converge về một record.

### Atlas and storage

Atlas là cache/audit layer, không phải source of truth. Production read APIs phải exclude `isSimulated = true` mặc định.

Storage quản lý data availability và confidentiality. Storage không được cấp private read từ unsigned wallet identity, DB optimistic status, pending transaction intent hoặc dry-run simulated state.

## 4. Money Flow Map

### Money containers

```text
Requestor Token Account
Worker Token Account
Worker Stake Source Account
Task Bounty Escrow Vault
Worker Stake Escrow
Judge Fee Reserve / Accounting
Judge Payout Accounts
```

### Phase 1: Create Task

```text
Requestor Token Account
  -- bounty_amount -->
Task Bounty Escrow Vault
```

Requestor fund bounty. Không có worker stake và chưa trả judge fee.

### Phase 2: Stake

```text
Worker Stake Source Account
  -- worker_stake_amount -->
Worker Stake Escrow
```

Worker stake bị lock. Worker được quyền access encrypted task detail sau khi có proof stake hợp lệ từ chain hoặc finalized indexed snapshot.

### Phase 3: Submit

```text
No token transfer.
Encrypted deliverable -> immutable storage URI/hash -> task submission state.
```

Bounty vẫn trong task escrow. Worker stake vẫn locked. Judges chỉ được access submission sau khi có assignment proof.

### Phase 4: Vote

```text
No token transfer.
Judge assignment updates vote state.
Task vote counters increase.
```

Judge fee chưa được trả trong phase vote. Vote state là input cho settlement.

### Phase 5A: Approved settlement

```text
Task Bounty Escrow Vault
  -- judge_fee_total_reserved -->
Judge Fee Reserve / Accounting

Task Bounty Escrow Vault
  -- bounty_amount - judge_fee_total_reserved -->
Worker Token Account

Worker Stake Escrow
  -- worker_stake_amount -->
Worker Stake Source/Payout Account
```

Invariant:

```text
bounty_amount =
  worker_payout
  + total_judge_fee_reserved
  + protocol_fee_if_any
  + dust_if_any

worker_stake_amount =
  worker_stake_returned
```

### Phase 5B: Rejected settlement

```text
Task Bounty Escrow Vault
  -- judge_fee_total_reserved -->
Judge Fee Reserve / Accounting

Task Bounty Escrow Vault
  -- bounty_amount - judge_fee_total_reserved -->
Requestor Token Account

Worker Stake Escrow
  -- slashed_amount -->
Configured Slash Recipient / Judge Fee Reserve / Protocol Treasury

Worker Stake Escrow
  -- returned_amount, if policy allows partial return -->
Worker Token Account
```

Invariant:

```text
bounty_amount =
  requestor_refund
  + total_judge_fee_reserved
  + protocol_fee_if_any
  + dust_if_any

worker_stake_amount =
  slashed_amount
  + worker_stake_returned
  + dust_if_any
```

### Phase 5C: No-quorum / inconclusive

Architecture hiện ghi nhận hai hướng hợp lệ:

- Reject settlement và giữ task ở `Resolving`.
- Chuyển sang explicit terminal state như `Inconclusive` / `ExpiredNoQuorum`.

QA kết luận no-quorum chưa đủ production-ready vì chưa có money policy bắt buộc. Hệ thống không được silently map no-quorum thành `Failed`.

### Fee and dust

Formula dự kiến:

```text
total_judge_fee_reserved = floor(bounty_amount * judge_fee_bps / 10000)
fee_per_judge = floor(total_judge_fee_reserved / eligible_judge_count)
dust = total_judge_fee_reserved - fee_per_judge * eligible_judge_count
```

Nếu `eligible_judge_count = 0`, không được chia fee. Settlement phải reject hoặc có policy explicit.

## 5. State Machine

Canonical lifecycle:

```text
[Created off-chain intent]
        |
        v
Open
  |-- stake_to_unlock --------------------> InProgress
  |-- cancel_open_task -------------------> Cancelled

InProgress
  |-- submit_and_assign / submit ---------> Resolving
  |-- cancel_expired_task ----------------> Cancelled

Resolving
  |-- judge_vote pass/fail ---------------> Resolving
  |-- settle_payment approved -----------> Completed
  |-- settle_payment rejected -----------> Failed
  |-- settle_payment no-quorum ----------> Inconclusive or reject settlement

Completed
  |-- claim_judge_fee, if applicable ----> Completed

Failed
  |-- claim_judge_fee, if applicable ----> Failed

Cancelled
  |-- terminal --------------------------> Cancelled
```

State semantics:

- `Open`: bounty locked, chưa có worker nhận task.
- `InProgress`: worker đã stake và là actor duy nhất được submit.
- `Resolving`: submission tồn tại, judges có thể vote, settlement chưa hoàn tất.
- `Completed`: approved outcome, worker nhận payout theo money rules.
- `Failed`: rejected outcome, requestor refund/slash rules đã được áp dụng.
- `Cancelled`: task bị cancel trước normal settlement.
- `Inconclusive`: trạng thái cần explicit nếu vote sau deadline không decisive.

Settlement chỉ được finalize khi kết quả decisive. Partial vote set không được biến thành final outcome giả.

## 6. Execution Guide Summary

### Prerequisites

Môi trường cần:

- Node.js `>=22 <23`.
- Yarn classic `1.22.x`.
- Rust toolchain tương thích Anchor/Solana.
- Solana CLI.
- Anchor CLI.
- MongoDB Atlas connection string hoặc local MongoDB.
- Wallet/keypair cho requestor, worker, judges và keeper/admin.
- SPL token mint và token accounts đúng mint của task.
- Program đã build/deploy và có IDL tại `target/idl/task_contract.json`.
- `.env` cấu hình RPC và Atlas/local MongoDB.

Biến môi trường tối thiểu:

```bash
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<options>
MONGODB_DB_NAME=task_web
SOLANA_RPC_URL=https://<rpc-endpoint>
ANCHOR_PROVIDER_URL=https://<rpc-endpoint>
ANCHOR_WALLET=/absolute/path/to/wallet.json
```

Setup chính:

```bash
yarn install
cp .env.example .env
yarn db:init
anchor build
anchor deploy --provider.cluster "$SOLANA_RPC_URL"
```

Local full stack:

```bash
yarn dev:full
```

Hoặc start riêng:

```bash
yarn db:start
yarn validator:start
```

Program hiện khai báo:

```text
DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB
```

### Runner pattern

Repo hiện chưa có CLI wrapper sẵn cho Phase 2-5. Các command trong guide giả định team có Anchor client/runner nội bộ gọi đúng instruction trong IDL.

Execute:

```bash
ANCHOR_PROVIDER_URL="$SOLANA_RPC_URL" ANCHOR_WALLET=<ACTOR_KEYPAIR> yarn ts-node <runner-path>.ts --mode=execute ...
```

Dry-run:

```bash
ANCHOR_PROVIDER_URL="$SOLANA_RPC_URL" ANCHOR_WALLET=<ACTOR_KEYPAIR> yarn ts-node <runner-path>.ts --mode=dry-run ...
```

Dry-run được phép ghi Atlas với `isSimulated = true`, nhưng không được send transaction, confirm signature hoặc cấp quyền đọc storage.

### Verification

Verify transaction:

```bash
solana confirm -v <SIGNATURE> --url "$SOLANA_RPC_URL"
```

Verify account:

```bash
solana account <TASK_PDA> --url "$SOLANA_RPC_URL"
solana account <WORKER_ESCROW_PDA> --url "$SOLANA_RPC_URL"
solana account <ASSIGNMENT_PDA> --url "$SOLANA_RPC_URL"
```

Verify Atlas canonical row phải exclude simulated:

```javascript
db.tasks.findOne({ taskPda: "<TASK_PDA>", isSimulated: { $ne: true } })
db.transactions.find({ taskPda: "<TASK_PDA>", isSimulated: { $ne: true } }).sort({ createdAt: 1 })
db.judge_assignments.find({ taskPda: "<TASK_PDA>" }).sort({ assignedOrder: 1 })
db.settlements.find({ taskPda: "<TASK_PDA>", isSimulated: { $ne: true } }).sort({ createdAt: 1 })
```

Canonical DB row hợp lệ cần có `lastIndexedSlot`, `lastIndexedCommitment`, `lastSignature`, `programId`, `decodedAccount` và không có `isSimulated = true`.

## 7. QA Findings Summary

Overall QA severity: high. Architecture đúng hướng nhưng chưa QA-complete cho real-money production nếu chưa siết settlement, assignment và DB/chain consistency.

P0 findings:

- No-quorum settlement chưa có một deterministic protocol path duy nhất.
- Money policy cho rejected và no-quorum chưa đầy đủ.
- Backend execute flow có thể ghi final-looking DB state trước canonical indexing.
- `Resolving` có thể tồn tại khi thiếu complete judge assignment accounts.
- Real-money judge selection có thể bị manipulate nếu vẫn dùng blockhash MVP randomness.

P1 findings:

- Dry-run records có thể pollute canonical reads nếu API không hard-exclude `isSimulated = true`.
- Thiếu explicit state cho assignment retry/pending assignment.
- Cancellation money flow chưa được đặc tả đầy đủ.
- Deadline semantics chưa rõ source of time, inclusivity, grace period và storage location.
- Finality level chưa nhất quán giữa confirm/finalized.
- Judge fee eligibility còn ambiguous.
- Stake idempotency chưa đủ rõ.
- DB schema thiếu canonical/snapshot versioning rõ ràng.
- Storage authorization có thể dựa vào indexed snapshot thiếu freshness constraints.
- Token asset model còn mở.

P2 findings:

- `votedAt = simulated now` có thể lệch chain time.
- `assignedJudges` bị duplicate giữa task cache và assignment records.
- `feeAmount` trong assignment có thể stale nếu ghi trước settlement.
- Transaction status taxonomy thiếu trạng thái finality upgrade.
- Orphan storage cleanup thiếu access revocation timing.
- Requestor access submission còn phụ thuộc product policy.

Money flow issues:

- Chưa có money matrix hoàn chỉnh cho mọi transition.
- Judge fee reservation timing chưa rõ.
- `eligible_judge_count = 0` có thể gây chia fee sai.
- Worker stake slash policy chưa fixed.
- Dust có thể bị kẹt nếu thiếu recovery policy.
- `protocol_fee_if_any` xuất hiện trong invariant nhưng chưa được đặc tả.
- Settlement summary từ balances có thể lệch event/account data nếu thiếu precedence rule.

State machine issues:

- `Inconclusive` chưa được tích hợp đầy đủ.
- `Resolving` đang bị overload.
- Terminal states vẫn cho judge fee claim nhưng claim progress nằm ngoài task state.
- Cancellation transitions chưa đầy đủ.
- Submit retry behavior chưa rõ.
- Vote/settlement race chưa được đóng chặt.
- Judge active policy có thể fork behavior nếu backend và contract dùng rule khác nhau.

## 8. Production Risks

Các rủi ro/blocker chính trước production:

- Không dùng real money nếu judge selection vẫn dựa trên `RandomnessMode::BlockhashMvp`; cần VRF, commit-reveal hoặc cơ chế unbiased tương đương.
- Không release private storage từ dry-run, pending intent hoặc DB-only optimistic state.
- Không cho production read API include `isSimulated = true` mặc định.
- Không cho backend-written final-looking state vượt qua indexer canonical snapshot.
- Không settle no-quorum nếu chưa có terminal state và money policy explicit.
- Không cho `Resolving` đi tiếp nếu judge assignments chưa complete hoặc chưa có retry/lazy-init invariant rõ ràng.
- Không tính fee nếu `eligible_judge_count = 0` mà chưa có policy reject/explicit.
- Không deploy real-money nếu fee, slash, dust, protocol fee, asset model và cancellation money flow chưa fixed.
- Không cấp storage access từ indexed proof nếu thiếu finality/freshness requirement.
- Không để lower-slot/lower-commitment snapshot overwrite newer/finalized snapshot.

Nhóm risk vận hành:

- Indexer lag làm UI/API nhìn stale state.
- Race giữa stake, submit/cancel, vote/settle và duplicate keeper settle.
- Atlas drift so với chain account hoặc token balances.
- Orphaned private storage object sau failed/expired transaction.
- Admin authority hardcoded không phù hợp production; cần config/multisig-compatible authority nếu dùng thật.

## 9. Conclusion

Task System Phase 1 → 5 đã có kiến trúc mục tiêu rõ: tiền và lifecycle nằm trên chain, Backend điều phối execution, Indexer ghi canonical read model, Atlas phục vụ audit/cache, Storage chỉ cấp quyền bằng proof hợp lệ.

Lifecycle chính gồm `Create Task -> Stake -> Submit -> Judge Vote -> Settle`, với `dry-run` và `execute` tách biệt. `dry-run` chỉ mô phỏng và ghi `isSimulated = true`; `execute` phải dựa vào confirmed on-chain transaction và được indexer reconcile thành snapshot canonical.

Tuy nhiên, tài liệu QA xác định hệ thống chưa đủ an toàn cho real-money production nếu chưa đóng các khoảng trống về no-quorum, money policy, judge assignment reliability, DB authority boundary, finality, storage authorization và unbiased judge selection.

Kết luận final: kiến trúc hiện phù hợp làm Phase 1-5 target design và runbook kỹ thuật cho môi trường dev/test. Trước production, các P0/P1 trong QA report cần được chuyển thành invariant bắt buộc ở smart contract, backend, indexer và API/storage authorization.
