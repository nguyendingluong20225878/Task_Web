# On-chain Proof Log - Task Web

## 1. Thông tin chung

| Mục | Giá trị |
|---|---|
| Ngày chạy | `<YYYY-MM-DD HH:mm>` |
| Network | Solana Devnet |
| RPC URL | `https://api.devnet.solana.com` |
| Program ID | `<PROGRAM_ID>` |
| Người chạy | `<Tên của bạn>` |
| Mục tiêu | Chứng minh on-chain core đã sẵn sàng để bắt đầu làm frontend |

## 2. Build Result

Command:

```bash
anchor build
```

Kết quả:

```text
<Dán output build thành công hoặc mô tả ngắn>
```

Artifacts:

```text
target/idl/task_contract.json
target/types/task_contract.ts
```

Ảnh:

```text
proof/screenshots/01-anchor-build-success.png
```

## 3. Deploy Result

Command:

```bash
anchor deploy --provider.cluster devnet
```

Program ID:

```text
<PROGRAM_ID>
```

Explorer:

```text
https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet
```

Ảnh:

```text
proof/screenshots/02-devnet-program-explorer.png
```

## 4. Bootstrap Protocol

Command:

```bash
node scripts/setup-create-task-prereqs.js
```

Kết quả:

```json
{
  "programId": "<PROGRAM_ID>",
  "admin": "<ADMIN_WALLET>",
  "systemConfig": "<SYSTEM_CONFIG_PDA>",
  "judgeRegistry": "<JUDGE_REGISTRY_PDA>",
  "judgeStakeVault": "<JUDGE_STAKE_VAULT_PDA>",
  "initSignature": "<INIT_SIGNATURE>",
  "judge": "<JUDGE_PUBKEY>",
  "judgeRecord": "<JUDGE_RECORD_PDA>",
  "judgeSignature": "<JUDGE_REGISTER_SIGNATURE>",
  "totalActiveJudges": 1,
  "activeJudgeCount": 1
}
```

Explorer:

```text
https://explorer.solana.com/tx/<INIT_SIGNATURE>?cluster=devnet
https://explorer.solana.com/tx/<JUDGE_REGISTER_SIGNATURE>?cluster=devnet
https://explorer.solana.com/address/<SYSTEM_CONFIG_PDA>?cluster=devnet
https://explorer.solana.com/address/<JUDGE_REGISTRY_PDA>?cluster=devnet
```

## 5. Create Task

Command:

```bash
npx ts-node scripts/create-task.ts --mode=execute ...
```

Kết quả:

```json
{
  "phase": "Phase 1: Create Task",
  "mode": "execute",
  "taskPda": "<TASK_PDA>",
  "escrowTokenVault": "<ESCROW_TOKEN_VAULT>",
  "nftAsset": "<NFT_ASSET>",
  "signature": "<CREATE_TASK_SIGNATURE>",
  "slot": "<SLOT>",
  "isSimulated": false
}
```

Explorer:

```text
https://explorer.solana.com/tx/<CREATE_TASK_SIGNATURE>?cluster=devnet
https://explorer.solana.com/address/<TASK_PDA>?cluster=devnet
https://explorer.solana.com/address/<ESCROW_TOKEN_VAULT>?cluster=devnet
```

Ảnh:

```text
proof/screenshots/04-create-task-transaction.png
proof/screenshots/05-task-pda-account.png
```

## 6. Worker Stake

Command:

```bash
npx ts-node scripts/phase2-stake.ts --mode=execute --task-id=<TASK_ID>
```

Kết quả:

```json
{
  "phase": "Phase 2: Stake",
  "mode": "execute",
  "taskId": "<TASK_ID>",
  "taskPda": "<TASK_PDA>",
  "worker": "<WORKER_PUBKEY>",
  "workerEscrow": "<WORKER_ESCROW_PDA>",
  "statusBefore": { "open": {} },
  "statusAfter": { "inProgress": {} },
  "signature": "<STAKE_SIGNATURE>",
  "slot": "<SLOT>",
  "isSimulated": false
}
```

Explorer:

```text
https://explorer.solana.com/tx/<STAKE_SIGNATURE>?cluster=devnet
https://explorer.solana.com/address/<WORKER_ESCROW_PDA>?cluster=devnet
```

## 7. Submit and Assign

Command:

```bash
npx ts-node scripts/phase3-submit.ts --mode=execute --task-id=<TASK_ID> --encrypted-submission-uri=enc://submission-<TASK_ID>
```

Kết quả:

```json
{
  "phase": "Phase 3: Submit and Assign",
  "mode": "execute",
  "taskId": "<TASK_ID>",
  "taskPda": "<TASK_PDA>",
  "judgeRegistry": "<JUDGE_REGISTRY_PDA>",
  "judgeRecords": ["<JUDGE_RECORD_PDA>"],
  "statusBefore": { "inProgress": {} },
  "statusAfter": { "resolving": {} },
  "assignedJudgeCount": 1,
  "assignedJudges": ["<JUDGE_PUBKEY>"],
  "signature": "<SUBMIT_ASSIGN_SIGNATURE>",
  "slot": "<SLOT>",
  "isSimulated": false
}
```

Explorer:

```text
https://explorer.solana.com/tx/<SUBMIT_ASSIGN_SIGNATURE>?cluster=devnet
```

## 8. Init Judge Assignment

Command:

```bash
npx ts-node scripts/phase3-init-judge-assignment.ts --mode=execute --task-id=<TASK_ID>
```

Kết quả:

```json
{
  "phase": "Phase 3b: Init Judge Assignment",
  "mode": "execute",
  "taskId": "<TASK_ID>",
  "taskPda": "<TASK_PDA>",
  "assignments": [
    {
      "judge": "<JUDGE_PUBKEY>",
      "judgeAssignment": "<JUDGE_ASSIGNMENT_PDA>",
      "assignedOrder": 0,
      "hasVoted": false,
      "signature": "<INIT_ASSIGNMENT_SIGNATURE>",
      "slot": "<SLOT>",
      "isSimulated": false
    }
  ]
}
```

Explorer:

```text
https://explorer.solana.com/tx/<INIT_ASSIGNMENT_SIGNATURE>?cluster=devnet
https://explorer.solana.com/address/<JUDGE_ASSIGNMENT_PDA>?cluster=devnet
```

## 9. Judge Vote

Command:

```bash
ANCHOR_WALLET=.anchor/judge-1.json \
SOLANA_RPC_URL=https://api.devnet.solana.com \
npx ts-node scripts/phase4-vote.ts --mode=execute --task-id=<TASK_ID> --vote=pass
```

Kết quả:

```json
{
  "phase": "Phase 4: Judge Vote",
  "mode": "execute",
  "taskId": "<TASK_ID>",
  "taskPda": "<TASK_PDA>",
  "judge": "<JUDGE_PUBKEY>",
  "judgeRecord": "<JUDGE_RECORD_PDA>",
  "judgeAssignment": "<JUDGE_ASSIGNMENT_PDA>",
  "vote": "pass",
  "passVoteCountBefore": 0,
  "passVoteCountAfter": 1,
  "hasVoted": true,
  "voteIsPass": true,
  "signature": "<JUDGE_VOTE_SIGNATURE>",
  "slot": "<SLOT>",
  "isSimulated": false
}
```

Explorer:

```text
https://explorer.solana.com/tx/<JUDGE_VOTE_SIGNATURE>?cluster=devnet
```

## 10. Settle Payment

Command:

```bash
npx ts-node scripts/phase5-settle.ts --mode=execute --task-id=<TASK_ID> --worker-token-account=<WORKER_TOKEN_ACCOUNT> --requestor-token-account=<REQUESTOR_TOKEN_ACCOUNT>
```

Kết quả:

```json
{
  "phase": "Phase 5: Settle Payment",
  "mode": "execute",
  "taskId": "<TASK_ID>",
  "result": "approved",
  "statusBefore": { "resolving": {} },
  "statusAfter": { "completed": {} },
  "passVoteCount": 1,
  "failVoteCount": 0,
  "feePerJudge": "<FEE_PER_JUDGE>",
  "totalJudgeFeeReserved": "<TOTAL_JUDGE_FEE_RESERVED>",
  "signature": "<SETTLE_SIGNATURE>",
  "slot": "<SLOT>",
  "isSimulated": false
}
```

Explorer:

```text
https://explorer.solana.com/tx/<SETTLE_SIGNATURE>?cluster=devnet
```

## 11. Claim Judge Fee

Command:

```bash
ANCHOR_WALLET=.anchor/judge-1.json \
SOLANA_RPC_URL=https://api.devnet.solana.com \
npx ts-node scripts/phase5-claim-judge-fee.ts --mode=execute --task-id=<TASK_ID> --judge-token-account=<JUDGE_TOKEN_ACCOUNT>
```

Kết quả:

```json
{
  "phase": "Phase 5b: Claim Judge Fee",
  "mode": "execute",
  "taskId": "<TASK_ID>",
  "judge": "<JUDGE_PUBKEY>",
  "judgeAssignment": "<JUDGE_ASSIGNMENT_PDA>",
  "feePerJudge": "<FEE_PER_JUDGE>",
  "judgeFeeClaimed": "<JUDGE_FEE_CLAIMED>",
  "hasClaimedFee": true,
  "signature": "<CLAIM_FEE_SIGNATURE>",
  "slot": "<SLOT>",
  "isSimulated": false
}
```

Explorer:

```text
https://explorer.solana.com/tx/<CLAIM_FEE_SIGNATURE>?cluster=devnet
```

## 12. Ảnh chụp bằng chứng

| Ảnh | Nội dung |
|---|---|
| `proof/screenshots/01-anchor-build-success.png` | Build contract thành công |
| `proof/screenshots/02-devnet-program-explorer.png` | Program ID trên Explorer Devnet |
| `proof/screenshots/03-admin-init-transaction.png` | Init protocol transaction |
| `proof/screenshots/04-create-task-transaction.png` | Create task transaction |
| `proof/screenshots/05-task-pda-account.png` | Task PDA account |
| `proof/screenshots/06-worker-stake-transaction.png` | Worker stake transaction |
| `proof/screenshots/07-submit-assign-transaction.png` | Submit and assign transaction |
| `proof/screenshots/08-judge-vote-transaction.png` | Judge vote transaction |
| `proof/screenshots/09-settle-payment-transaction.png` | Settle transaction |
| `proof/screenshots/10-claim-judge-fee-transaction.png` | Claim judge fee transaction |

## 13. Kết luận

Kết luận đề xuất:

```text
Phần on-chain core đã sẵn sàng để bắt đầu làm frontend.

Lý do:
- Smart contract build thành công.
- IDL đã được sinh ra cho frontend tích hợp.
- Program đã deploy lên Solana Devnet.
- Các instruction chính đã chạy thành công bằng transaction thật.
- Task state đã chuyển qua các trạng thái Open -> InProgress -> Resolving -> Completed.
- Các transaction và PDA/account đều xem được trên Solana Explorer Devnet.
- Các script đều chạy ở mode execute với isSimulated=false.
```
