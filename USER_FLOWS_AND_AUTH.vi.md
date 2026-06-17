# Phân tích Role, User Flow và Authorization

## 1. Các role trong hệ thống

Source code thể hiện các role chính:

1. **Admin/Protocol Operator**
2. **Requestor/Creator**
3. **Worker**
4. **Judge**
5. **Payer/Relayer**
6. **Indexer/API/Storage service**

Trong smart contract, "role" không nằm trong bảng user riêng. Quyền được xác định bằng `Signer`, PDA seed, Anchor constraint, owner của token account và field state trong on-chain account.

## 2. Admin/Protocol Operator

### Flow

Admin khởi tạo protocol:

1. Gọi `admin_init_protocol(judge_fee_bps)`.
2. Tạo PDA `system_config`.
3. Tạo PDA `judge_registry`.
4. Tạo PDA `judge_stake_vault`.
5. Set `judge_fee_bps`, `max_judges_per_task`, `randomness_mode = BlockhashMvp`.

### Instruction/API

- On-chain: `admin_init_protocol`
- File: `programs/task_web/src/instructions/admin_init_protocol.rs`
- Script hỗ trợ: `scripts/setup-create-task-prereqs.js`

### Authorization

Admin bị hard-code:

```rust
address = pubkey!("3GwNFgdo1Nb7tm3cJuNs7vkWHvTEdeX5MjYcriLxKR7D")
```

Chỉ wallet này mới init protocol được. Nếu dùng wallet khác, Anchor trả `UnauthorizedAdmin`.

## 3. Requestor/Creator

### Flow tạo task

1. Requestor chuẩn bị SPL token account có bounty.
2. Gọi `initialize_task(...)`.
3. Program validate:
   - deadline hợp lệ;
   - bounty/stake > 0;
   - URI không quá `MAX_URI_LENGTH`;
   - `encrypted_submission_uri` ban đầu rỗng;
   - judge config hợp lệ;
   - có đủ active judges;
   - creator token account đúng owner và mint.
4. Transfer bounty từ `creator_token_account` vào `escrow_token_vault`.
5. Tạo `Task` PDA với status `Open`.
6. Tạo Metaplex Core NFT asset, owner là task PDA.

### Flow hủy task Open

1. Requestor gọi `cancel_open_task`.
2. Chỉ hủy được khi task đang `Open`, chưa có worker, chưa vote, chưa reserve judge fee.
3. Program refund token trong vault về requestor token account.
4. NFT asset được transfer về requestor.
5. Task status thành `Cancelled`.

### Flow hủy task quá deadline khi worker không nộp bài

1. Task đang `InProgress`, worker đã stake nhưng `encrypted_submission_uri` còn rỗng.
2. Sau `submission_deadline`, requestor gọi `cancel_expired_task`.
3. Program refund bounty về requestor.
4. NFT về requestor.
5. Worker escrow bị close về requestor, `is_slashed = true`, task `Cancelled`.

### Flow nhận settlement

Requestor không nhất thiết phải là signer của `settle_payment`; instruction có `payer` riêng. Tuy vậy, account `requestor` phải khớp `task.requestor`, và nếu task fail/inconclusive thì requestor token account nhận payout.

### Instruction/API

- `initialize_task`
- `cancel_open_task`
- `cancel_expired_task`
- `settle_payment`
- CLI:
  - `scripts/create-task.ts`
  - `scripts/phase5-settle.ts`

### Authorization

- `initialize_task`: `creator: Signer`; token account constraint `owner == creator`, `mint == token_mint`.
- `cancel_open_task`: `requestor: Signer`; constraint `task.requestor == requestor.key()`.
- `cancel_expired_task`: `requestor: Signer`; constraint `task.requestor == requestor.key()`.
- `settle_payment`: `requestor` account constrained to `task.requestor`; `requestor_token_account.owner == task.requestor`.

## 4. Worker

### Flow nhận task

1. Worker xem task `Open`.
2. Gọi `stake_to_unlock`.
3. Program transfer SOL bằng `worker_stake_amount` vào `WorkerEscrow` PDA.
4. Set `task.worker = worker`.
5. Set `task.status = InProgress`.

### Flow nộp bài và assign judge

1. Worker gọi `submit_and_assign(encrypted_submission_uri)` trước `submission_deadline`.
2. Program validate worker khớp `task.worker`, task đang `InProgress`.
3. Worker phải truyền tất cả `JudgeRecord` active trong `remaining_accounts`, đúng thứ tự trong `judge_registry`.
4. Program validate judge active, không trùng, không phải worker.
5. Program chọn `required_judges_m` judge bằng hash `task + worker + slot + nonce`.
6. Update `assigned_judges`, tăng `total_assignment_count`, lock judge stake đến `voting_deadline`.
7. Task sang `Resolving`.

### Flow nhận bounty/stake

Sau khi vote đủ ngưỡng pass, bất kỳ payer nào cũng có thể gọi `settle_payment`. Nếu approved:

- Vault chuyển bounty sau khi trừ judge fee reserve cho `worker_token_account`.
- Worker escrow close về `worker_system_account`, worker lấy lại SOL stake.
- Task `Completed`.

### Instruction/API

- `stake_to_unlock`
- `submit_and_assign`
- `settle_payment`
- CLI:
  - `scripts/phase2-stake.ts`
  - `scripts/phase3-submit.ts`
  - `scripts/phase5-settle.ts`

### Authorization

- `stake_to_unlock`: `worker: Signer`, task phải `Open`.
- `submit_and_assign`: `worker: Signer`, constraint `task.worker == worker.key()`, task phải `InProgress`.
- `settle_payment`: `worker_token_account.owner == task.worker`, `worker_system_account.key() == task.worker`, `worker_escrow.worker == task.worker`.

## 5. Judge

### Flow đăng ký judge

1. Judge gọi `judge_register(stake_amount)`.
2. Program transfer SOL stake vào `judge_stake_vault`.
3. Tạo `JudgeRecord`.
4. Thêm judge vào `JudgeRegistry`.
5. Tăng `system_config.total_active_judges`.

### Flow được assign

1. Worker submit task và program chọn judge.
2. Bất kỳ payer nào gọi `init_judge_assignment` cho từng assigned judge.
3. Tạo `TaskJudgeAssignment` PDA.

### Flow vote

1. Judge gọi `judge_vote(is_pass)`.
2. Program validate:
   - judge signer;
   - task `Resolving`;
   - có `JudgeRecord`;
   - có `TaskJudgeAssignment`;
   - chưa vote;
   - judge nằm đúng order trong `task.assigned_judges`;
   - chưa quá `voting_deadline`.
3. Ghi vote vào assignment.
4. Tăng `pass_vote_count` hoặc `fail_vote_count`.

### Flow claim fee

1. Sau settlement `Completed` hoặc `Failed`, judge gọi `claim_judge_fee`.
2. Chỉ judge vote đúng side thắng mới claim được.
3. Program transfer `fee_amount` từ task vault sang `judge_token_account`.
4. Mark `has_claimed_fee`.

### Flow unregister

1. Judge gọi `judge_unregister`.
2. Chỉ unregister được khi `current_time > locked_until`.
3. Xóa judge khỏi registry bằng swap-with-last.
4. Refund SOL stake từ judge stake vault.
5. Close `JudgeRecord`.

### Instruction/API

- `judge_register`
- `judge_unregister`
- `init_judge_assignment`
- `judge_vote`
- `claim_judge_fee`
- CLI:
  - `scripts/setup-create-task-prereqs.js`
  - `scripts/phase3-init-judge-assignment.ts`
  - `scripts/phase4-vote.ts`
  - `scripts/phase5-claim-judge-fee.ts`

### Authorization

- `judge_register`: `judge: Signer`; `JudgeRecord` PDA seed theo judge.
- `judge_unregister`: `judge: Signer`; `JudgeRecord` PDA seed theo judge; check `locked_until`.
- `judge_vote`: `judge: Signer`; `JudgeRecord` và `TaskJudgeAssignment` PDA seed theo judge; check assignment order.
- `claim_judge_fee`: `judge: Signer`; assignment seed theo judge; token account owner là judge.

## 6. Payer/Relayer

Payer không phải business owner của task. Một số instruction cho phép payer trả phí tạo account/giao dịch:

- `init_judge_assignment`: payer tạo assignment account cho judge.
- `settle_payment`: payer trigger settlement, nhưng payout vẫn theo task state.

Authorization của payer gần như chỉ là `Signer`; quyền nghiệp vụ được ràng buộc bằng account constraints của task/requestor/worker/judge.

## 7. Indexer/API/Storage

### API skeleton

`services/api/src/index.ts` định nghĩa:

- `WalletAuth`
- `TransactionDraft`
- `PendingTransactionIntent`
- `requireWalletAuth`
- `createTransactionIntent`
- `assertReadModelFresh`

Chưa có HTTP route Express/Fastify. Vai trò hiện tại là helper logic cho backend API trong tương lai.

### Indexer skeleton

`services/indexer/src/index.ts` build `ChainTaskSnapshot` và gọi writer:

- bắt buộc có `slot`, `signature`, `commitment`, `programId`, `decodedAccount`;
- checkpoint chỉ advance khi slot mới lớn hơn slot cũ.

### Storage skeleton

`services/storage/src/index.ts` lưu object immutable theo SHA-256:

- `put(bytes, contentType)` tạo `local://<checksum>.bin`;
- `get(request)` yêu cầu `ChainProof` gồm task PDA, wallet, role, slot, signature, commitment.

## 8. Bảng tổng hợp instruction

| Instruction | Role chính | Trạng thái vào | Trạng thái ra |
|---|---|---|---|
| `admin_init_protocol` | Admin | none | system ready |
| `judge_register` | Judge | judge not registered | active judge |
| `judge_unregister` | Judge | active/unlocked | inactive/closed |
| `initialize_task` | Requestor | system ready | `Open` |
| `cancel_open_task` | Requestor | `Open` | `Cancelled` |
| `stake_to_unlock` | Worker | `Open` | `InProgress` |
| `submit_and_assign` | Worker | `InProgress` | `Resolving` |
| `init_judge_assignment` | Payer/Judge service | `Resolving` | assignment created |
| `judge_vote` | Judge | `Resolving` | vote counters updated |
| `settle_payment` | Payer/Relayer | decisive/inconclusive `Resolving` | `Completed`/`Failed`/`Inconclusive` |
| `claim_judge_fee` | Judge | `Completed`/`Failed` | fee claimed |
| `cancel_expired_task` | Requestor | expired `InProgress` | `Cancelled` |
