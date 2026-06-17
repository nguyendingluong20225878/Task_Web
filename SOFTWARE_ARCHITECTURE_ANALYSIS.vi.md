# Phân tích Kiến trúc Tổng quan - Task Web

## 1. Mục đích dự án

Dự án `task_web` là một giao thức task/escrow chạy trên Solana, được viết bằng Anchor. Hệ thống cho phép:

- Requestor tạo task, nạp bounty bằng SPL token vào escrow vault và tạo Metaplex Core NFT đại diện cho task.
- Worker stake SOL để nhận việc, sau đó nộp kết quả bằng URI đã mã hóa.
- Hệ thống chọn judge từ judge pool để chấm bài.
- Judge vote pass/fail.
- Protocol thực hiện settlement: trả bounty cho worker nếu task đạt, hoàn bounty cho requestor nếu task fail/inconclusive, và giữ lại một phần bounty làm judge fee cho các judge vote đúng.
- MongoDB off-chain chỉ đóng vai trò read model/cache cho app, không phải nguồn sự thật của tiền, vote, trạng thái hay settlement.

Đây là kiến trúc hybrid theo hướng **on-chain protocol + off-chain indexing/storage**:

- Smart contract Anchor là core state machine và settlement authority.
- MongoDB là cache/read model cho UI, API và indexer.
- Storage service giữ nội dung lớn hoặc nhạy cảm ngoài chain, truy cập bằng proof on-chain.
- API layer hiện tại mới là skeleton tạo transaction intent, chưa có HTTP server hoàn chỉnh.

## 2. Mô hình kiến trúc

### On-chain state machine

Core protocol nằm trong `programs/task_web/src`. Mỗi hành động nghiệp vụ là một Anchor instruction. Trạng thái task đi qua các status:

```text
Open -> InProgress -> Resolving -> Completed
                           |       -> Failed
                           |       -> Inconclusive
Open -> Cancelled
InProgress -> Cancelled
```

### Thiết kế xoay quanh PDA và escrow

Protocol dùng PDA làm authority:

- `system_config`: cấu hình protocol.
- `judge_registry`: danh sách judge đang active.
- `judge_stake_vault`: PDA giữ SOL stake của judge.
- `task`: account lưu task state, đồng thời làm authority của token vault và NFT.
- `vault`: SPL token account giữ bounty.
- `escrow`: worker stake escrow.
- `task_judge`: assignment record của từng judge trên từng task.

### Off-chain read model

Thư mục `app/db` định nghĩa các collection MongoDB:

- `tasks`
- `judges`
- `judge_assignments`
- `transactions`

Repository đã thể hiện nguyên tắc kiến trúc khá rõ: các hàm update trực tiếp protocol state như `upsertTask` và `updateTaskStatus` bị disable. Task status phải đi từ on-chain snapshot qua indexer.

## 3. Công nghệ cốt lõi

| Công nghệ | Vai trò |
|---|---|
| Rust | Viết smart contract Solana/Anchor. |
| Anchor `0.31.1` | Framework Solana program: account validation, IDL, test runner, PDA constraints. |
| `anchor-spl` | CPI với SPL Token để transfer bounty và judge fee. |
| Metaplex Core `mpl-core` | Tạo và transfer NFT asset đại diện cho task. |
| Solana local validator | Chạy localnet để test smart contract. |
| TypeScript/Node.js 22 | Scripts CLI, test, API/indexer/storage skeleton. |
| `@coral-xyz/anchor` JS | Client SDK gọi instruction Anchor từ scripts/tests. |
| MongoDB | Off-chain cache/read model/indexed data. |
| Mocha/Chai/ts-mocha | Test suite TypeScript. |
| dotenv | Load `.env` cho scripts và DB. |

## 4. Cấu trúc thư mục

```text
.
├── Anchor.toml
├── Cargo.toml
├── package.json
├── programs/task_web
│   ├── Cargo.toml
│   └── src
│       ├── lib.rs
│       ├── errors.rs
│       ├── state
│       │   ├── system.rs
│       │   ├── task.rs
│       │   ├── escrow.rs
│       │   └── judge_pool.rs
│       └── instructions
│           ├── admin_init_protocol.rs
│           ├── judge_register.rs
│           ├── judge_unregister.rs
│           ├── initialize_task.rs
│           ├── cancel_open_task.rs
│           ├── stake_to_unlock.rs
│           ├── submit_and_assign.rs
│           ├── init_judge_assignment.rs
│           ├── judge_vote.rs
│           ├── settle_payment.rs
│           ├── claim_judge_fee.rs
│           └── cancel_expired_task.rs
├── app/db
│   ├── config.ts
│   ├── mongo.ts
│   ├── collections.ts
│   ├── models.ts
│   ├── repositories.ts
│   ├── init-db.ts
│   └── demo-seed.ts
├── services
│   ├── api/src/index.ts
│   ├── indexer/src/index.ts
│   └── storage/src/index.ts
├── scripts
│   ├── start-all.sh
│   ├── start-validator.sh
│   ├── start-mongo.sh
│   ├── setup-create-task-prereqs.js
│   ├── create-task.ts
│   ├── phase2-stake.ts
│   ├── phase3-submit.ts
│   ├── phase3-init-judge-assignment.ts
│   ├── phase4-vote.ts
│   ├── phase5-settle.ts
│   └── phase5-claim-judge-fee.ts
└── tests
    ├── task_web.ts
    └── fixtures/local-validator.ts
```

## 5. Các file quan trọng

- `programs/task_web/src/lib.rs`: public interface của Anchor program.
- `programs/task_web/src/state/task.rs`: state của task, assignment và status enum.
- `programs/task_web/src/state/judge_pool.rs`: judge registry và judge stake record.
- `programs/task_web/src/state/system.rs`: admin/config/randomness mode.
- `programs/task_web/src/state/escrow.rs`: worker stake escrow.
- `programs/task_web/src/errors.rs`: domain error code.
- `app/db/repositories.ts`: quy tắc bắt buộc read model phải lấy từ chain snapshot.
- `scripts/*.ts`: CLI để test từng phase mà không cần frontend.

## 6. Nhận xét kiến trúc

Kiến trúc hiện tại đã đưa phần quan trọng nhất lên on-chain: escrow token, worker stake, judge stake, vote count, status, assignment và settlement. Vì vậy, giả định rằng toàn bộ logic và dữ liệu hiện đang off-chain không hoàn toàn đúng với source hiện tại. Project này đã theo hướng smart-contract-first. Phần off-chain còn lại chủ yếu là cache, encrypted URI, transaction draft và storage object.

Rủi ro hoặc điểm thiết kế cần chú ý:

- Admin public key đang hard-code trong `admin_init_protocol.rs`, không lấy từ cấu hình deploy.
- Random judge selection đang dùng `BlockhashMvp` với hash của slot/task/worker/nonce, chưa phải VRF có khả năng chống manipulation mạnh.
- `initialize_task` yêu cầu đã có đủ `total_active_judges`, nên bootstrap protocol phải init config và register judge trước.
- `services/api` chưa phải web API server đầy đủ, nên Postman/cURL hiện chưa áp dụng trực tiếp nếu không bổ sung HTTP route.
