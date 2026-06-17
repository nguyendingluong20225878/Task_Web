# Requestor UI On-chain Readiness

## 1. Kết luận ngắn

UI requestor hiện tại **chưa đủ để demo tạo task thật on-chain**.

Lý do chính:

- UI create quest đang gọi hàm mock `initializeTask`, không gọi Anchor program trên Devnet.
- Wallet store là mock, không connect Phantom/Solflare hoặc wallet adapter thật.
- Form chưa có field `tokenMint` và `creatorTokenAccount`, trong khi `initialize_task` on-chain bắt buộc cần hai account này.
- UI không hiển thị `signature`, Explorer link, `escrowTokenVault`, `nftAsset`, `slot`, `isSimulated=false`.
- Project hiện chưa có cấu hình/dev script SvelteKit/Vite trong `package.json`, chưa có `svelte.config.*`, `vite.config.*`, `src/app.html`, nên chưa thể mở UI bằng dev server từ repo hiện tại.

Nói cách khác: UI hiện tại là **prototype/gamified mock UI**, phù hợp để trình bày luồng UX, nhưng chưa đủ để chứng minh requestor tạo task on-chain như CLI `scripts/create-task.ts` đã làm.

## 2. Vị trí UI requestor trong code

Route tạo task:

```text
src/routes/quests/create/+page.svelte
```

Component chính:

```text
src/components/quests/QuestCreateWizard.svelte
```

Transaction mock:

```text
src/lib/solana/transactions/initializeTask.ts
```

Wallet mock:

```text
src/lib/stores/wallet.ts
```

Quest local store:

```text
src/lib/stores/quests.ts
```

Transaction status store:

```text
src/lib/stores/tx.ts
```

Quest detail:

```text
src/routes/quests/[taskPda]/+page.svelte
src/components/quests/QuestDetailPanel.svelte
```

## 3. UI hiện đang làm gì

### `src/routes/quests/create/+page.svelte`

File này chỉ render:

```svelte
<QuestCreateWizard on:launched={handleLaunched} />
```

Sau khi launch thành công, UI redirect sang:

```text
/quests/<taskPda>
```

### `QuestCreateWizard.svelte`

UI có 3 bước:

1. Quest info:
   - `title`
   - `summary`

2. Reward & deadline:
   - `bountyAmount`
   - `workerStakeAmount`
   - `submissionDeadline`
   - `votingDeadline`

3. Judges & secret payload:
   - `requiredJudgesM`
   - `approvalThresholdN`
   - `encryptedPayload`

Sau khi submit, component gọi:

```ts
initializeTask($walletStore.publicKey, {
  title,
  summary,
  publicMetadataUri: metadataObject.uri,
  encryptedTaskDetailUri: payloadObject.uri,
  bountyAmount,
  workerStakeAmount,
  submissionDeadline: new Date(submissionDeadline),
  votingDeadline: new Date(votingDeadline),
  requiredJudgesM,
  approvalThresholdN,
});
```

Nhưng `initializeTask` hiện là mock.

## 4. Bằng chứng UI chưa gọi on-chain thật

File:

```text
src/lib/solana/transactions/initializeTask.ts
```

Nội dung chính:

```ts
export async function initializeTask(
  wallet: string,
  params: InitializeQuestParams
): Promise<InitializeTaskResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const id = `${Date.now()}`;
  const fingerprint = `${wallet.slice(0, 6)}${id.slice(-6)}`;

  return {
    signature: `mock-init-${fingerprint}`,
    taskPda: `TaskPda${fingerprint}`,
    id,
  };
}
```

Điều này nghĩa là:

- Không đọc IDL.
- Không tạo Anchor `Program`.
- Không derive PDA thật.
- Không tạo SPL token vault.
- Không gọi `program.methods.initializeTask(...)`.
- Không ký ví thật.
- Không gửi transaction lên Devnet.
- `signature` chỉ là chuỗi `mock-init-*`.
- `taskPda` chỉ là chuỗi `TaskPda*`, không phải PDA thật.

## 5. Wallet hiện tại cũng là mock

File:

```text
src/lib/stores/wallet.ts
```

Wallet connect mặc định:

```ts
connect: (publicKey = "QuestMaster111111111111111111111111111111") =>
```

Điều này nghĩa là:

- Không connect Phantom/Solflare.
- Không có `signTransaction`.
- Không có `signAllTransactions`.
- Không kiểm tra network Devnet.
- Không lấy public key thật của requestor.

## 6. Storage hiện tại cũng là mock

File:

```text
src/lib/api/storage.ts
```

Hàm:

```ts
mockUploadToStorage(...)
```

trả URI dạng:

```text
mock://public-metadata/<...>
mock://encrypted-payload/<...>
```

Đây là mock UX. Với on-chain proof hiện tại vẫn có thể dùng URI giả, nhưng nên ghi rõ đây chưa phải IPFS/Arweave/storage thật.

## 7. So sánh UI với CLI `create-task.ts`

CLI đã chạy thành công trên Devnet:

```text
scripts/create-task.ts
```

CLI nhận đủ dữ liệu:

- `id`
- `tokenMint`
- `creatorTokenAccount`
- `bountyAmount`
- `workerStakeAmount`
- `requiredJudgesM`
- `approvalThresholdN`
- `submissionDeadline`
- `votingDeadline`
- `publicMetadataUri`
- `encryptedTaskDetailUri`
- `encryptedSubmissionUri`

CLI gọi thật:

```ts
program.methods.initializeTask(...)
```

và trả:

- `taskPda`
- `escrowTokenVault`
- `nftAsset`
- `signature`
- `slot`
- `isSimulated: false`

UI hiện tại thiếu:

- `task id` manual input.
- `token mint` input.
- `creator/requestor token account` input.
- `encryptedSubmissionUri` explicit empty field.
- Anchor transaction call thật.
- Wallet signer thật.
- Display `escrowTokenVault`.
- Display `nftAsset`.
- Display `slot`.
- Display `isSimulated=false`.
- Explorer links.
- Duplicate task id handling.
- `InvalidTokenAccount` validation.
- `NotEnoughJudges` handling.

## 8. Checklist requestor on-chain readiness

| Yêu cầu | UI hiện tại | Nhận xét |
|---|---:|---|
| Connect wallet thật | Chưa | Đang dùng mock wallet store |
| Hiển thị Devnet | Chưa | Không có network indicator |
| Nhập task id | Chưa | ID được tạo bằng `Date.now()` trong mock |
| Nhập token mint | Chưa | Đang hard-code mock mint khi add local store |
| Nhập creator token account | Chưa | Không có field |
| Nhập bounty amount | Có | Nhưng chưa convert/gọi on-chain |
| Nhập worker stake amount | Có | Nhưng chưa convert/gọi on-chain |
| Nhập requiredJudgesM | Có | Default 3, không phù hợp Devnet hiện có 1 judge |
| Nhập approvalThresholdN | Có | Default 2, không phù hợp proof 1/1 |
| Nhập publicMetadataUri | Gián tiếp mock | Từ `mockUploadToStorage` |
| Nhập encryptedTaskDetailUri | Gián tiếp mock | Từ `mockUploadToStorage` |
| Gọi `initialize_task` thật | Chưa | `initializeTask.ts` là mock |
| Hiển thị taskPda thật | Chưa | Mock `TaskPda*` |
| Hiển thị escrowTokenVault | Chưa | Mock `MockVault*` |
| Hiển thị nftAsset | Chưa | Mock `MockAsset*` |
| Hiển thị signature thật | Chưa | Mock `mock-init-*` |
| Có Explorer link | Chưa | Không render Explorer URL |
| Hiển thị `isSimulated=false` | Chưa | Result type không có field này |
| Validate `NotEnoughJudges` | Chưa | Không gọi chain nên chưa bắt lỗi |
| Validate `InvalidTokenAccount` | Chưa | Không có token account input |
| Validate duplicate task id | Chưa | Không check account tồn tại |

## 9. Có mở UI hiện tại được không?

Hiện tại repo có file `.svelte`, nhưng thiếu các thành phần tối thiểu để chạy SvelteKit/Vite:

- Không có `dev` script trong `package.json`.
- Không có dependency `@sveltejs/kit`, `svelte`, `vite`.
- Không có `svelte.config.*`.
- Không có `vite.config.*`.
- Không có `src/app.html`.

Đã thử:

```bash
npm run dev
```

Kết quả: lệnh lỗi vì project không có dev script frontend.

Vì vậy hiện chưa có URL/port chính thức để mở UI từ codebase này. Muốn mở UI cần bổ sung scaffold SvelteKit/Vite hoặc chuyển các component này vào app frontend đã có cấu hình.

## 10. Nếu bổ sung frontend runner, cách mở UI nên là

Sau khi có SvelteKit/Vite config và dependencies:

```bash
npm run dev -- --host 0.0.0.0
```

hoặc:

```bash
yarn dev --host 0.0.0.0
```

URL dự kiến:

```text
http://localhost:5173/quests/create
```

Nhưng lệnh này **chưa chạy được với repo hiện tại** vì thiếu frontend config/dependencies.

## 11. Dữ liệu Devnet nên dùng khi UI đã nối thật

Khi UI đã có form đầy đủ, dùng:

```text
Network: Devnet
RPC: https://api.devnet.solana.com
Program ID: DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB
Token mint: GW7391EnGsU5oksJPQibH8ky5iUA2njTiobhb7bjji1B
Requestor token account: D1UJ5zE7UCZpHxdTE6dvESN8bn7xjMLCRJpjxKJENNjo
Bounty amount: 1000000
Worker stake amount: 100000000
Required judges M: 1
Approval threshold N: 1
Public metadata URI: ipfs://task-ui-public
Encrypted task detail URI: enc://task-ui-detail
Encrypted submission URI: empty string
```

Task id nên dùng id mới, ví dụ:

```text
2001
```

để tránh lỗi:

```text
account already in use
```

## 12. Cách kiểm chứng task tạo từ UI có lưu on-chain không

Khi UI đã gọi thật, sau khi bấm Launch Quest cần lấy:

- `signature`
- `taskPda`
- `escrowTokenVault`
- `nftAsset`
- `slot`
- `isSimulated=false`

Mở Explorer:

```text
https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet
https://explorer.solana.com/address/<TASK_PDA>?cluster=devnet
https://explorer.solana.com/address/<ESCROW_TOKEN_VAULT>?cluster=devnet
https://explorer.solana.com/address/<NFT_ASSET>?cluster=devnet
```

Kiểm tra token transfer:

```text
creator token account -> escrow token vault
```

Account requestor token:

```text
D1UJ5zE7UCZpHxdTE6dvESN8bn7xjMLCRJpjxKJENNjo
```

Mint:

```text
GW7391EnGsU5oksJPQibH8ky5iUA2njTiobhb7bjji1B
```

Nếu UI trả signature thật nhưng Explorer không thấy transaction, hoặc signature có dạng `mock-init-*`, thì UI chưa ghi on-chain.

## 13. Minimal patch đề xuất

### Ưu tiên 1: Làm frontend chạy được

Bổ sung SvelteKit/Vite scaffold:

- `svelte.config.js`
- `vite.config.ts`
- `src/app.html`
- dependencies: `svelte`, `@sveltejs/kit`, `vite`
- script: `"dev": "vite dev"`

### Ưu tiên 2: Wallet thật

Thay `walletStore` mock bằng Solana wallet adapter hoặc tích hợp `window.solana` tạm thời:

- connect Phantom.
- lấy public key thật.
- có `signTransaction`.
- hiển thị network Devnet.

### Ưu tiên 3: Thay `initializeTask.ts` mock bằng transaction thật

Port logic từ:

```text
scripts/create-task.ts
```

sang frontend transaction builder:

- load IDL.
- tạo `Program`.
- derive `systemConfig`, `taskPda`, `escrowTokenVault`.
- generate `nftAsset` keypair.
- gọi `program.methods.initializeTask(...)`.
- ký bằng connected wallet + `nftAsset`.
- confirm signature.
- trả `taskPda`, `escrowTokenVault`, `nftAsset`, `signature`, `slot`, `isSimulated=false`.

### Ưu tiên 4: Thêm field còn thiếu vào UI

Thêm vào wizard:

- `taskId`
- `tokenMint`
- `creatorTokenAccount`
- optional `encryptedSubmissionUri` default `""`

Set default Devnet:

```text
tokenMint = GW7391EnGsU5oksJPQibH8ky5iUA2njTiobhb7bjji1B
creatorTokenAccount = D1UJ5zE7UCZpHxdTE6dvESN8bn7xjMLCRJpjxKJENNjo
requiredJudgesM = 1
approvalThresholdN = 1
bountyAmount = 1000000
workerStakeAmount = 100000000
```

### Ưu tiên 5: Proof UI

Sau launch, hiển thị:

- `signature`
- `taskPda`
- `escrowTokenVault`
- `nftAsset`
- `slot`
- `isSimulated=false`
- Explorer links.

## 14. Có nên bắt đầu FE requestor chưa?

Có thể bắt đầu FE, nhưng cần phân biệt:

```text
On-chain backend: đã chứng minh chạy được bằng CLI trên Devnet.
Requestor UI hiện tại: chưa tích hợp on-chain thật.
```

Vì vậy kết luận hợp lý:

```text
Phần on-chain core đã đủ điều kiện để bắt đầu làm FE.
Nhưng UI requestor hiện tại mới là mock/prototype, chưa thể dùng để chứng minh tạo task on-chain.
Việc tiếp theo là nối UI requestor với cùng logic đã chạy thành công trong scripts/create-task.ts.
```

## 15. Kết luận cuối

UI requestor hiện tại **chưa đủ để demo on-chain**.

Nó đã có:

- Form UX tạo quest.
- Các field cơ bản như bounty, stake, deadline, judge count.
- Local store để hiển thị task sau khi tạo.
- Detail page và cancel button mock.

Nó còn thiếu:

- Dev server/config để chạy UI.
- Wallet thật.
- Field token mint và requestor token account.
- Anchor transaction thật.
- Explorer proof.
- On-chain result thật.
- Error handling theo Anchor errors.

Khuyến nghị:

1. Giữ UI hiện tại làm nền giao diện.
2. Bổ sung cấu hình SvelteKit/Vite để chạy được.
3. Thay `initializeTask.ts` mock bằng implementation thật dựa trên `scripts/create-task.ts`.
4. Thêm proof panel sau khi tạo task.
5. Dùng Devnet data đã chứng minh thành công để test UI.
