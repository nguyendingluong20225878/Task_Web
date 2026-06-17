# Hướng dẫn chạy Backend / Smart Contract không cần Frontend

## 1. Yêu cầu môi trường

Cần có:

- Node.js `22.22.3` theo `.nvmrc` và `.node-version`.
- Yarn classic `1.22.22`.
- Rust/Cargo.
- Solana CLI và `solana-test-validator`.
- Anchor CLI `0.31.1`.
- MongoDB local `mongod` nếu muốn dùng off-chain cache.

Kiểm tra nhanh:

```bash
node -v
yarn -v
rustc --version
cargo --version
solana --version
anchor --version
mongod --version
```

## 2. Cài dependencies

```bash
yarn install
```

Nếu cần build Anchor:

```bash
anchor build
```

Nếu cần chạy test:

```bash
yarn test
```

Lưu ý: test suite đọc `target/idl/task_contract.json`, nên nếu IDL chưa tồn tại hoặc đã cũ, hãy chạy `anchor build` trước.

## 3. Biến môi trường

File `.env.example` hiện tại:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=task_web
SOLANA_RPC_URL=http://127.0.0.1:8899
```

Tạo `.env`:

```bash
cp .env.example .env
```

Các biến thường dùng bổ sung:

```env
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
ANCHOR_WALLET=/home/<user>/.config/solana/id.json
EXECUTION_MODE=dry-run
DB_WRITE_TIMEOUT_MS=15000
DB_CLOSE_TIMEOUT_MS=2000

CREATE_TASK_ID=1001
CREATE_TASK_BOUNTY_AMOUNT=1000000
CREATE_TASK_WORKER_STAKE_AMOUNT=100000000
CREATE_TASK_REQUIRED_JUDGES_M=1
CREATE_TASK_APPROVAL_THRESHOLD_N=1
CREATE_TASK_PUBLIC_METADATA_URI=ipfs://task-public
CREATE_TASK_ENCRYPTED_TASK_DETAIL_URI=enc://task-detail
CREATE_TASK_ENCRYPTED_SUBMISSION_URI=

PHASE2_TASK_ID=1001
PHASE3_TASK_ID=1001
PHASE3_ENCRYPTED_SUBMISSION_URI=enc://submission
PHASE4_TASK_ID=1001
PHASE4_VOTE=pass
PHASE5_TASK_ID=1001
```

## 4. Khởi động local services

### Cách 1: chạy tất cả

```bash
yarn dev:full
```

Script `scripts/start-all.sh` sẽ:

- load `.env`;
- start MongoDB nếu `MONGODB_URI` là local;
- start `solana-test-validator`;
- clone Metaplex Core program từ devnet vào local validator;
- ping MongoDB và Solana RPC.

### Cách 2: chạy riêng

MongoDB:

```bash
yarn db:start
```

Solana validator:

```bash
yarn validator:start
```

Kiểm tra validator:

```bash
yarn validator:version
```

## 5. Chuẩn bị MongoDB

Tạo indexes:

```bash
yarn db:init
```

Seed demo read model:

```bash
yarn db:demo
```

Kiểm tra DB:

```bash
yarn db:ping
```

## 6. Chuẩn bị Solana wallet và deploy

Nếu chưa có wallet:

```bash
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --url http://127.0.0.1:8899
solana airdrop 10
```

Build và deploy:

```bash
anchor build
anchor deploy
```

Quan trọng: `admin_init_protocol.rs` yêu cầu admin signer là public key hard-code `3GwNFgdo1Nb7tm3cJuNs7vkWHvTEdeX5MjYcriLxKR7D`. Wallet local phải khớp key này nếu muốn execute `admin_init_protocol`. Nếu không, test/source-level vẫn chạy được, nhưng execute bootstrap protocol sẽ fail `UnauthorizedAdmin`.

## 7. Test nhanh bằng test suite

```bash
yarn test
```

Test suite hiện tại có hai nhóm:

- Source/IDL regression: đọc source, đọc IDL, check instruction/status/constraints.
- Runtime smoke: chỉ chạy khi có `ANCHOR_PROVIDER_URL` và `ANCHOR_WALLET`; vì admin key hard-code, test có case kỳ vọng non-admin bị reject.

## 8. Test E2E bằng CLI scripts

### 8.1 Bootstrap protocol và judge

```bash
node scripts/setup-create-task-prereqs.js
```

Script này:

- load IDL từ `target/idl/task_contract.json`;
- derive `system_config`, `judge_registry`, `judge_stake_vault`;
- airdrop SOL cho wallet;
- gọi `adminInitProtocol(500)` nếu config chưa tồn tại;
- tạo/lặp lại `.anchor/judge-1.json`;
- register 1 judge với stake `1_000_000_000` lamports.

Nếu admin wallet không khớp hard-code, bước init sẽ fail.

### 8.2 Phase 1: Create task

Dry-run:

```bash
npx ts-node scripts/create-task.ts \
  --mode=dry-run \
  --id=1001 \
  --bounty-amount=1000000 \
  --worker-stake-amount=100000000 \
  --required-judges-m=1 \
  --approval-threshold-n=1 \
  --public-metadata-uri=ipfs://task-1001 \
  --encrypted-task-detail-uri=enc://task-1001 \
  --encrypted-submission-uri=
```

Execute yêu cầu có SPL mint và creator token account:

```bash
npx ts-node scripts/create-task.ts \
  --mode=execute \
  --id=1001 \
  --token-mint=<SPL_MINT> \
  --creator-token-account=<CREATOR_TOKEN_ACCOUNT> \
  --bounty-amount=1000000 \
  --worker-stake-amount=100000000 \
  --required-judges-m=1 \
  --approval-threshold-n=1 \
  --public-metadata-uri=ipfs://task-1001 \
  --encrypted-task-detail-uri=enc://task-1001 \
  --encrypted-submission-uri=
```

### 8.3 Phase 2: Worker stake

```bash
npx ts-node scripts/phase2-stake.ts --mode=execute --task-id=1001
```

Wallet hiện tại sẽ được dùng làm worker. Worker phải có đủ SOL để stake.

### 8.4 Phase 3: Worker submit và assign judge

```bash
npx ts-node scripts/phase3-submit.ts \
  --mode=execute \
  --task-id=1001 \
  --encrypted-submission-uri=enc://submission-1001
```

Script đọc `judge_registry`, derive tất cả `judge_record`, rồi truyền vào `remainingAccounts`.

### 8.5 Phase 3b: Init assignment records

```bash
npx ts-node scripts/phase3-init-judge-assignment.ts \
  --mode=execute \
  --task-id=1001
```

Nếu chỉ muốn tạo cho một judge:

```bash
npx ts-node scripts/phase3-init-judge-assignment.ts \
  --mode=execute \
  --task-id=1001 \
  --judge=<JUDGE_PUBKEY>
```

### 8.6 Phase 4: Judge vote

Cần chạy bằng wallet của judge đã được assign:

```bash
ANCHOR_WALLET=.anchor/judge-1.json \
npx ts-node scripts/phase4-vote.ts \
  --mode=execute \
  --task-id=1001 \
  --vote=pass
```

### 8.7 Phase 5: Settle payment

Cần có token account của worker và requestor cho cùng mint:

```bash
npx ts-node scripts/phase5-settle.ts \
  --mode=execute \
  --task-id=1001 \
  --worker-token-account=<WORKER_TOKEN_ACCOUNT> \
  --requestor-token-account=<REQUESTOR_TOKEN_ACCOUNT>
```

### 8.8 Phase 5b: Judge claim fee

Cần chạy bằng wallet judge và token account của judge:

```bash
ANCHOR_WALLET=.anchor/judge-1.json \
npx ts-node scripts/phase5-claim-judge-fee.ts \
  --mode=execute \
  --task-id=1001 \
  --judge-token-account=<JUDGE_TOKEN_ACCOUNT>
```

## 9. Ghi chú về cURL/Postman

Hiện tại repo chưa có HTTP server thực sự. `services/api/src/index.ts` chỉ là domain helper cho wallet auth và transaction intent. Vì vậy:

- Không có endpoint HTTP để gọi trực tiếp bằng cURL/Postman.
- Cách test đúng nhất hiện nay là Anchor CLI/TypeScript scripts.
- Nếu muốn thêm Postman/cURL, cần bổ sung Express/Fastify server bọc các hàm:
  - `POST /tx-intents`
  - `GET /tasks/open`
  - `GET /judges/:wallet/assignments`
  - `POST /storage`
  - `GET /storage/:uri`

## 10. Lỗi thường gặp

- `UnauthorizedAdmin`: wallet không khớp admin hard-code.
- `NotEnoughJudges`: chưa register đủ judge trước khi create task.
- `InvalidTokenAccount`: token account sai owner/mint hoặc sai vault.
- `DeadlinePassed`: submit/vote quá deadline.
- `InvalidJudgePool`: `remainingAccounts` judge record không khớp registry hoặc sai thứ tự.
- `AssignmentSetIncomplete`: settlement không truyền đủ assignment accounts.
