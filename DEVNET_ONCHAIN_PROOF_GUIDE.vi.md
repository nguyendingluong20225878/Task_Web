# Hướng dẫn chứng minh on-chain trên Devnet trước khi làm Frontend

Mục tiêu của tài liệu này là giúp bạn tạo bộ bằng chứng để show với giáo sư rằng phần on-chain/backend core đã đủ điều kiện bắt đầu làm FE.

Bộ bằng chứng nên có:

- File Markdown ghi kết quả chạy.
- Transaction signatures.
- PDA/account addresses.
- Link Solana Explorer Devnet.
- Ảnh chụp màn hình Explorer và terminal.
- Kết luận rõ: contract build được, IDL sinh được, transaction ghi state on-chain thành công.

## 1. Kết luận kỹ thuật trước khi chạy

Code hiện tại đã có logic on-chain chính:

- `admin_init_protocol`
- `judge_register`
- `initialize_task`
- `stake_to_unlock`
- `submit_and_assign`
- `init_judge_assignment`
- `judge_vote`
- `settle_payment`
- `claim_judge_fee`
- `cancel_open_task`
- `cancel_expired_task`

Các state quan trọng đã nằm on-chain:

- `SystemConfig`
- `JudgeRegistry`
- `JudgeRecord`
- `Task`
- `WorkerEscrow`
- `TaskJudgeAssignment`
- SPL token escrow vault
- Metaplex Core NFT asset

Vì vậy, thứ cần chứng minh không phải là "có code", mà là:

```text
Build pass
+ Deploy devnet pass
+ Init protocol pass
+ Create task on-chain pass
+ State transition pass
+ Explorer xem được transaction/account
```

## 2. Cảnh báo quan trọng về code hiện tại

Trong file `programs/task_web/src/instructions/admin_init_protocol.rs`, admin đang bị hard-code:

```rust
address = pubkey!("3GwNFgdo1Nb7tm3cJuNs7vkWHvTEdeX5MjYcriLxKR7D")
```

Điều này nghĩa là chỉ private key của ví có public key:

```text
3GwNFgdo1Nb7tm3cJuNs7vkWHvTEdeX5MjYcriLxKR7D
```

mới gọi được `admin_init_protocol`.

Nếu bạn không có private key của ví này, flow devnet sẽ bị kẹt ngay bước init protocol với lỗi:

```text
UnauthorizedAdmin
```

Có 2 cách xử lý:

### Cách A: Có private key admin hard-code

Nếu bạn có keypair của ví `3GwNF...`, dùng keypair đó làm `ANCHOR_WALLET`.

### Cách B: Không có private key admin hard-code

Đây là trường hợp phổ biến. Bạn nên sửa admin hard-code thành ví devnet của bạn, rồi build/deploy lại. Đây vẫn là chỉnh sửa hợp lý trước FE, vì admin hiện tại là config triển khai, không phải business logic.

Quy trình:

1. Lấy địa chỉ ví devnet của bạn:

   ```bash
   solana address
   ```

2. Thay địa chỉ trong `admin_init_protocol.rs`:

   ```rust
   address = pubkey!("YOUR_DEVNET_WALLET_ADDRESS") @ TaskError::UnauthorizedAdmin
   ```

3. Build lại:

   ```bash
   anchor build
   ```

4. Deploy lại lên devnet.

Nếu giáo sư hỏi, giải thích ngắn:

```text
Admin address là deployment configuration. Em đổi từ hard-code cũ sang ví deploy devnet để có thể bootstrap protocol trên devnet.
```

## 3. Chuẩn bị môi trường

Kiểm tra toolchain:

```bash
node -v
yarn -v
anchor --version
solana --version
```

Version theo repo:

```text
Node.js: >=22 <23
Anchor: 0.31.1
Yarn: 1.22.22
```

Cài dependencies:

```bash
yarn install
```

Set Solana sang devnet:

```bash
solana config set --url https://api.devnet.solana.com
solana config get
```

Tạo hoặc kiểm tra ví:

```bash
solana address
solana balance
```

Airdrop devnet SOL:

```bash
solana airdrop 5
solana balance
```

Nếu faucet bị rate-limit, thử lại sau vài phút hoặc dùng faucet web của Solana.

## 4. Cấu hình `.env` cho devnet

Tạo hoặc sửa `.env`:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
ANCHOR_WALLET=/home/<user>/.config/solana/id.json

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=task_web

EXECUTION_MODE=execute
DB_WRITE_TIMEOUT_MS=15000
DB_CLOSE_TIMEOUT_MS=2000
```

MongoDB không phải điều kiện bắt buộc để ghi on-chain, nhưng script `create-task.ts` có cố gắng ghi cache. Nếu MongoDB không chạy, script vẫn có thể warning chứ không nhất thiết fail on-chain.

## 5. Thêm cấu hình devnet vào `Anchor.toml`

`Anchor.toml` hiện chỉ có:

```toml
[programs.localnet]
task_contract = "DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB"
```

Nên thêm:

```toml
[programs.devnet]
task_contract = "DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB"
```

Và đổi provider khi deploy:

```toml
[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"
```

Hoặc không sửa provider, nhưng khi chạy command thì truyền `--provider.cluster devnet`.

## 6. Build contract và sinh IDL

Chạy:

```bash
anchor build
```

Kiểm tra artifact:

```bash
ls -l target/idl/task_contract.json
ls -l target/types/task_contract.ts
```

Đây là bằng chứng đầu tiên để show:

```text
Contract compile thành công.
IDL đã sinh ra, FE có thể dùng IDL để gọi program.
```

## 7. Kiểm tra Program ID

Program ID trong code hiện tại:

```text
DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB
```

Kiểm tra keypair deploy:

```bash
solana address -k target/deploy/task_contract-keypair.json
```

Nếu kết quả khác `DaLMrh...`, chạy:

```bash
anchor keys sync
anchor build
```

Sau đó kiểm tra lại `declare_id!` trong:

```text
programs/task_web/src/lib.rs
```

## 8. Deploy lên Devnet

Chạy:

```bash
anchor deploy --provider.cluster devnet
```

Kiểm tra program trên Explorer:

```text
https://explorer.solana.com/address/DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB?cluster=devnet
```

Chụp ảnh màn hình trang Program Address.

## 9. Optional: Upload Anchor IDL lên on-chain

Nếu muốn Solana Explorer decode program tốt hơn, có thể upload IDL:

```bash
anchor idl init \
  --filepath target/idl/task_contract.json \
  DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB \
  --provider.cluster devnet
```

Nếu IDL đã tồn tại:

```bash
anchor idl upgrade \
  --filepath target/idl/task_contract.json \
  DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB \
  --provider.cluster devnet
```

Explorer IDL page:

```text
https://explorer.solana.com/address/DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB/idl?cluster=devnet
```

## 10. Bootstrap protocol và judge

Chạy:

```bash
node scripts/setup-create-task-prereqs.js
```

Script này sẽ:

- derive `systemConfig`;
- derive `judgeRegistry`;
- derive `judgeStakeVault`;
- gọi `adminInitProtocol(500)` nếu chưa init;
- tạo `.anchor/judge-1.json` nếu chưa có;
- airdrop SOL cho judge;
- gọi `judgeRegister(1_000_000_000)`.

Output cần lưu vào file proof:

```json
{
  "rpcUrl": "https://api.devnet.solana.com",
  "programId": "...",
  "admin": "...",
  "systemConfig": "...",
  "judgeRegistry": "...",
  "judgeStakeVault": "...",
  "initSignature": "...",
  "judge": "...",
  "judgeRecord": "...",
  "judgeSignature": "...",
  "totalActiveJudges": 1,
  "activeJudgeCount": 1
}
```

Explorer links:

```text
https://explorer.solana.com/tx/<initSignature>?cluster=devnet
https://explorer.solana.com/tx/<judgeSignature>?cluster=devnet
https://explorer.solana.com/address/<systemConfig>?cluster=devnet
https://explorer.solana.com/address/<judgeRegistry>?cluster=devnet
https://explorer.solana.com/address/<judgeRecord>?cluster=devnet
```

## 11. Chuẩn bị SPL token cho task bounty

`initialize_task` yêu cầu SPL token mint và creator token account. Cách nhanh nhất là dùng `spl-token` CLI.

Tạo mint:

```bash
spl-token create-token
```

Output sẽ có token mint, ví dụ:

```text
Creating token <TOKEN_MINT>
```

Tạo token account cho creator:

```bash
spl-token create-account <TOKEN_MINT>
```

Mint token vào creator token account:

```bash
spl-token mint <TOKEN_MINT> 1000
```

Xem token account:

```bash
spl-token accounts
```

Bạn cần lưu:

```text
TOKEN_MINT=<TOKEN_MINT>
CREATOR_TOKEN_ACCOUNT=<CREATOR_TOKEN_ACCOUNT>
```

## 12. Phase 1: Create task on-chain

Dùng `required-judges-m=1` vì script bootstrap hiện tạo 1 judge.

```bash
npx ts-node scripts/create-task.ts \
  --mode=execute \
  --id=1001 \
  --token-mint=GW7391EnGsU5oksJPQibH8ky5iUA2njTiobhb7bjji1B \
  --creator-token-account=D1UJ5zE7UCZpHxdTE6dvESN8bn7xjMLCRJpjxKJENNjo \
  --bounty-amount=1000000 \
  --worker-stake-amount=100000000 \
  --required-judges-m=1 \
  --approval-threshold-n=1 \
  --public-metadata-uri=ipfs://task-1001-public \
  --encrypted-task-detail-uri=enc://task-1001-detail \
  --encrypted-submission-uri=
```

Output cần lưu:

```json
{
  "phase": "Phase 1: Create Task",
  "mode": "execute",
  "taskPda": "...",
  "escrowTokenVault": "...",
  "nftAsset": "...",
  "signature": "...",
  "slot": 123,
  "isSimulated": false
}
```

Điểm quan trọng để chứng minh:

```json
"isSimulated": false
```

Explorer links:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
https://explorer.solana.com/address/<taskPda>?cluster=devnet
https://explorer.solana.com/address/<escrowTokenVault>?cluster=devnet
https://explorer.solana.com/address/<nftAsset>?cluster=devnet
```

## 13. Chuẩn bị ví worker

Hiện các phase script dùng `anchor.Wallet.local()`, tức là ví từ `ANCHOR_WALLET`.

Cách đơn giản cho proof: dùng cùng ví deploy làm worker. Điều này không sai về mặt kỹ thuật demo, vì goal là chứng minh state transition on-chain. Nếu muốn đẹp hơn, tạo keypair worker riêng và đổi `ANCHOR_WALLET` khi chạy phase worker.

Tạo worker riêng:

```bash
solana-keygen new --outfile .anchor/worker-devnet.json
solana airdrop 2 .anchor/worker-devnet.json --url devnet
```

Khi chạy worker scripts:

```bash
ANCHOR_WALLET=.anchor/worker-devnet.json \
SOLANA_RPC_URL=https://api.devnet.solana.com \
npx ts-node scripts/phase2-stake.ts --mode=execute --task-id=1001
```

## 14. Phase 2: Worker stake

```bash
npx ts-node scripts/phase2-stake.ts \
  --mode=execute \
  --task-id=1001
```

Output cần lưu:

```json
{
  "phase": "Phase 2: Stake",
  "mode": "execute",
  "taskId": "1001",
  "taskPda": "...",
  "worker": "...",
  "workerEscrow": "...",
  "statusBefore": { "open": {} },
  "statusAfter": { "inProgress": {} },
  "amountStaked": "100000000",
  "signature": "...",
  "slot": 123,
  "isSimulated": false
}
```

Explorer links:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
https://explorer.solana.com/address/<workerEscrow>?cluster=devnet
https://explorer.solana.com/address/<taskPda>?cluster=devnet
```

## 15. Phase 3: Submit và assign judge

Phải chạy bằng đúng worker wallet đã stake.

```bash
npx ts-node scripts/phase3-submit.ts \
  --mode=execute \
  --task-id=1001 \
  --encrypted-submission-uri=enc://submission-1001
```

Output cần lưu:

```json
{
  "phase": "Phase 3: Submit and Assign",
  "mode": "execute",
  "taskId": "1001",
  "taskPda": "...",
  "judgeRegistry": "...",
  "judgeRecords": ["..."],
  "statusBefore": { "inProgress": {} },
  "statusAfter": { "resolving": {} },
  "assignedJudgeCount": 1,
  "assignedJudges": ["..."],
  "signature": "...",
  "slot": 123,
  "isSimulated": false
}
```

Explorer link:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
```

## 16. Phase 3b: Init judge assignment

```bash
npx ts-node scripts/phase3-init-judge-assignment.ts \
  --mode=execute \
  --task-id=1001
```

Output cần lưu:

```json
{
  "phase": "Phase 3b: Init Judge Assignment",
  "mode": "execute",
  "taskId": "1001",
  "taskPda": "...",
  "assignments": [
    {
      "judge": "...",
      "judgeAssignment": "...",
      "assignedOrder": 0,
      "hasVoted": false,
      "signature": "...",
      "slot": 123,
      "isSimulated": false
    }
  ]
}
```

Explorer links:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
https://explorer.solana.com/address/<judgeAssignment>?cluster=devnet
```

## 17. Phase 4: Judge vote

Script bootstrap tạo judge keypair tại:

```text
.anchor/judge-1.json
```

Chạy vote bằng judge wallet:

```bash
ANCHOR_WALLET=.anchor/judge-1.json \
SOLANA_RPC_URL=https://api.devnet.solana.com \
npx ts-node scripts/phase4-vote.ts \
  --mode=execute \
  --task-id=1001 \
  --vote=pass
```

Output cần lưu:

```json
{
  "phase": "Phase 4: Judge Vote",
  "mode": "execute",
  "taskId": "1001",
  "taskPda": "...",
  "judge": "...",
  "judgeRecord": "...",
  "judgeAssignment": "...",
  "vote": "pass",
  "passVoteCountBefore": 0,
  "passVoteCountAfter": 1,
  "hasVoted": true,
  "voteIsPass": true,
  "signature": "...",
  "slot": 123,
  "isSimulated": false
}
```

Explorer link:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
```

## 18. Chuẩn bị token accounts cho settle và claim fee

Worker token account:

```bash
spl-token create-account <TOKEN_MINT> --owner <WORKER_PUBKEY>
```

Requestor token account thường đã là `CREATOR_TOKEN_ACCOUNT`.

Judge token account:

```bash
spl-token create-account <TOKEN_MINT> --owner <JUDGE_PUBKEY>
```

Lưu lại:

```text
WORKER_TOKEN_ACCOUNT=<...>
REQUESTOR_TOKEN_ACCOUNT=<...>
JUDGE_TOKEN_ACCOUNT=<...>
```

## 19. Phase 5: Settle payment

```bash
npx ts-node scripts/phase5-settle.ts \
  --mode=execute \
  --task-id=1001 \
  --worker-token-account=<WORKER_TOKEN_ACCOUNT> \
  --requestor-token-account=<REQUESTOR_TOKEN_ACCOUNT>
```

Output cần lưu:

```json
{
  "phase": "Phase 5: Settle Payment",
  "mode": "execute",
  "taskId": "1001",
  "result": "approved",
  "statusBefore": { "resolving": {} },
  "statusAfter": { "completed": {} },
  "passVoteCount": 1,
  "failVoteCount": 0,
  "feePerJudge": "...",
  "totalJudgeFeeReserved": "...",
  "signature": "...",
  "slot": 123,
  "isSimulated": false
}
```

Explorer link:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
```

## 20. Phase 5b: Claim judge fee

Chạy bằng judge wallet:

```bash
ANCHOR_WALLET=.anchor/judge-1.json \
SOLANA_RPC_URL=https://api.devnet.solana.com \
npx ts-node scripts/phase5-claim-judge-fee.ts \
  --mode=execute \
  --task-id=1001 \
  --judge-token-account=<JUDGE_TOKEN_ACCOUNT>
```

Output cần lưu:

```json
{
  "phase": "Phase 5b: Claim Judge Fee",
  "mode": "execute",
  "taskId": "1001",
  "judge": "...",
  "judgeAssignment": "...",
  "feePerJudge": "...",
  "judgeFeeClaimed": "...",
  "hasClaimedFee": true,
  "signature": "...",
  "slot": 123,
  "isSimulated": false
}
```

Explorer link:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
```

## 21. Những ảnh nên chụp để show giáo sư

Tạo thư mục:

```bash
mkdir -p proof/screenshots
```

Nên chụp các ảnh:

```text
proof/screenshots/01-anchor-build-success.png
proof/screenshots/02-devnet-program-explorer.png
proof/screenshots/03-admin-init-transaction.png
proof/screenshots/04-create-task-transaction.png
proof/screenshots/05-task-pda-account.png
proof/screenshots/06-worker-stake-transaction.png
proof/screenshots/07-submit-assign-transaction.png
proof/screenshots/08-judge-vote-transaction.png
proof/screenshots/09-settle-payment-transaction.png
proof/screenshots/10-claim-judge-fee-transaction.png
```

Điểm quan trọng trong ảnh:

- URL có `cluster=devnet`.
- Transaction status success.
- Program ID đúng.
- Account address/PDA đúng với output script.
- Nếu có log, chụp log instruction.

## 22. File Markdown nộp/show

Dùng template:

```text
ONCHAIN_PROOF_LOG_TEMPLATE.vi.md
```

Sau khi chạy xong, copy thành:

```text
ONCHAIN_PROOF_LOG.vi.md
```

Điền:

- ngày giờ chạy;
- network `Devnet`;
- program id;
- signatures;
- PDA;
- Explorer links;
- ảnh chụp;
- kết luận.

## 23. Câu kết luận nên nói với giáo sư

Bạn có thể nói:

```text
Em đã build và deploy smart contract Anchor lên Solana Devnet. Contract đã sinh IDL để frontend tích hợp. Em đã chạy thử flow on-chain từ khởi tạo protocol, đăng ký judge, tạo task, worker stake, submit, assign judge, judge vote, settle payment và claim judge fee. Mỗi bước đều có transaction signature, PDA/account address và link Solana Explorer Devnet. Vì vậy phần on-chain core đã đủ ổn định để bắt đầu làm frontend.
```

## 24. Checklist đạt yêu cầu

Chỉ nên nói "sẵn sàng sang FE" khi có đủ:

- [ ] `anchor build` pass.
- [ ] `target/idl/task_contract.json` tồn tại.
- [ ] Program deploy được lên devnet.
- [ ] Explorer mở được Program ID.
- [ ] `admin_init_protocol` success.
- [ ] `judge_register` success.
- [ ] `initialize_task` success, có `taskPda`.
- [ ] `stake_to_unlock` success, task sang `InProgress`.
- [ ] `submit_and_assign` success, task sang `Resolving`.
- [ ] `init_judge_assignment` success.
- [ ] `judge_vote` success, vote count tăng.
- [ ] `settle_payment` success, task sang `Completed`.
- [ ] `claim_judge_fee` success.
- [ ] Mọi script output đều có `"isSimulated": false`.
- [ ] Có file `ONCHAIN_PROOF_LOG.vi.md`.
- [ ] Có ảnh chụp Explorer.
