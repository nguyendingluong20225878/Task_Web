# Web3 UI Devnet Implementation

## Cách chạy app

```bash
npm install
npm run dev
```

Mở URL Next.js hiển thị trong terminal, mặc định là `http://localhost:3000`.

App dùng:

- Framework: Next.js 14 + React 18 + TypeScript
- UI/style: Tailwind CSS + shadcn-like components
- Data fetching: SWR + fetch/on-chain client helpers
- Ví crypto: Solana Wallet Adapter
- RPC: `https://api.devnet.solana.com`
- Program ID: `DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB`
- IDL: `target/idl/task_contract.json`
- Network hiển thị trong UI: Solana Devnet

Lưu ý route chính đang chạy qua Next Pages Router tại `src/pages/index.tsx`, render UI React ở `src/components/web3-console.tsx`. Các file Svelte/Vite cũ đã được đưa vào `legacy/sveltekit/` để tham khảo, không còn nằm trong `src` và không còn là entrypoint của `npm run dev` hoặc `npm run build`.

## Phase 1: App chạy được, wallet connect, role selector

Đã làm:

- Bổ sung Next.js setup: `dev`, `build`, `preview`.
- Tích hợp Phantom qua Solana Wallet Adapter.
- Wallet state lấy từ Solana Wallet Adapter (`useWallet`, `useAnchorWallet`, `WalletMultiButton`), provider ký transaction đi qua adapter.
- Role selector sau khi connect: Requestor, Worker.
- Không còn hard-code user wallet trong flow chính.

Cách test:

1. Chạy `npm run dev`.
2. Mở app, bấm `Connect Phantom`.
3. Chọn network Devnet trong Phantom.
4. Chọn từng role và xác nhận dashboard đổi action theo role.

Explorer proof:

- Phase này chưa gửi transaction. Proof là public key ví thật đang connect và Devnet RPC/Program ID hiển thị trên UI.

## Phase 2: Requestor create task thật trên Devnet

Đã làm:

- `src/lib/solana/client.ts` tạo Anchor provider/program từ Phantom wallet.
- Derive PDA thật: `systemConfig`, `taskPda`, `escrowTokenVault`.
- Sinh `nftAsset` keypair client-side chỉ cho Metaplex Core asset signer.
- Validate `requestorTokenAccount`:
  - owner phải là connected wallet
  - mint phải bằng `tokenMint`
  - balance phải đủ `bountyAmount`
- Gọi instruction thật `initializeTask`.
- Hiển thị `signature`, `slot`, `taskPda`, `escrowTokenVault`, `nftAsset`, account URLs, `isSimulated=false`.

Cách test:

1. Connect Phantom Devnet.
2. Chọn role `Requestor`.
3. Nhập `taskId` chưa dùng.
4. Giữ hoặc sửa `tokenMint`.
5. Bấm `Find ATA` hoặc `Create ATA`.
6. Đảm bảo token account có đủ balance base units cho bounty.
7. Bấm `Initialize Task` và approve Phantom.

Explorer proof:

- UI hiện `Explorer Proof`.
- Mở `signature` URL: `https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet`.
- Mở các account URL cho `taskPda`, `escrowTokenVault`, `nftAsset`.

## Phase 3: Worker stake/submit thật

Đã làm:

- Worker dashboard là first-class dashboard theo cùng template panel/button hiện tại.
- Có segmented tabs: `Open Tasks`, `My Active`, `Submit`, `Proof Log`.
- `Open Tasks` fetch on-chain bằng `program.account.task.all()`, có search/filter theo taskId/requestor/status.
- Mỗi task card hiển thị taskId, taskPda, requestor, worker, tokenMint, bounty, stake, judges/threshold, deadline, metadata, vote count, Explorer account link.
- Có nút `Stake To Unlock` ngay trên task Open.
- `My Active` hiển thị task có `worker == connected wallet` và status InProgress/Resolving/Completed/Failed/Inconclusive.
- `Submit` có taskId, encryptedSubmissionUri, worker token mint, workerTokenAccount, nút derive ATA và tạo ATA.
- Validate trước submit: task phải `InProgress`, worker trên task phải là connected wallet, encryptedSubmissionUri không rỗng.
- Gọi instruction thật `stakeToUnlock`.
- Gọi instruction thật `submitAndAssign(encryptedSubmissionUri)`.
- Fetch `judgeRegistry`, derive active `judgeRecord` PDAs, truyền vào `remainingAccounts`.
- Hiển thị state proof và Explorer link sau mỗi tx.

Cách test:

1. Connect ví worker thật trên Devnet.
2. Chọn role `Worker`.
3. Vào tab `Open Tasks`, search task nếu cần.
4. Bấm `Stake To Unlock` trên task Open, approve Phantom.
5. Vào tab `Submit`, nhập hoặc kiểm tra `encryptedSubmissionUri`.
6. Bấm `Submit And Assign`, approve Phantom.
7. Dùng `Find Worker ATA` hoặc `Create Worker ATA` để chuẩn bị token account cho payer settle.

Explorer proof:

- Tx stake: kiểm tra `taskPda` chuyển `Open -> InProgress`, `workerEscrow` được tạo.
- Tx submit: kiểm tra `taskPda` chuyển `InProgress -> Resolving`, assigned judges xuất hiện trên task.

## Phase 4: Judge vote/claim thật

Trạng thái sau conversion Next/React:

- UI Next hiện tại chưa expose role `Judge` trong role selector.
- Các helper Solana cho `judgeRegister`, `judgeVote`, `claimJudgeFee`, `fetchJudgeRecord`, `fetchJudgeAssignment` vẫn nằm trong `src/lib/solana/client.ts` để dùng cho phase sau.
- Không coi Phase 4 là hoàn thành ở frontend Next cho tới khi có Judge dashboard React.

Cách test hiện tại:

1. Không test qua UI Next vì chưa có Judge dashboard.
2. Test bằng script/CLI hoặc thêm Judge dashboard React trước khi đánh dấu phase này xong.

Explorer proof:

- Chưa có Explorer proof từ UI Next cho Phase 4.
- Khi implement UI, proof cần có `judgeRecord`, `judgeRegistry`, `judgeStakeVault`, `taskPda`, `judgeAssignment`, `judgeTokenAccount`, tx signature.

## Phase 5: Payer settle thật

Trạng thái sau conversion Next/React:

- UI Next hiện tại chưa expose role `Payer` trong role selector.
- Các helper Solana cho `initJudgeAssignment` và `settlePayment` vẫn nằm trong `src/lib/solana/client.ts` để dùng cho phase sau.
- Không coi Phase 5 là hoàn thành ở frontend Next cho tới khi có Payer dashboard React.

Cách test hiện tại:

1. Không test qua UI Next vì chưa có Payer dashboard.
2. Test bằng script/CLI hoặc thêm Payer dashboard React trước khi đánh dấu phase này xong.

Explorer proof:

- Chưa có Explorer proof từ UI Next cho Phase 5.
- Khi implement UI, proof cần có từng tx signature, `judgeAssignment`, `taskPda`, `workerEscrow`, `workerTokenAccount`, `requestorTokenAccount`.

## Các phần đã làm

- Không hard-code requestor/worker wallet trong flow chính.
- Program ID/RPC nằm trong config client.
- Default demo token mint editable trong form.
- Transaction success luôn trả `isSimulated=false`.
- Map lỗi phổ biến: `UnauthorizedAdmin`, `NotEnoughJudges`, `InvalidTokenAccount`, `InvalidStatus`, `DeadlinePassed`, `AlreadyVoted`, `AlreadyClaimed`, `AssignmentSetIncomplete`, duplicate task/account in use, wallet rejected.
- Không dùng private key hoặc `.anchor/*.json` trong browser.
- CLI scripts và smart contract không bị sửa.
- Worker role đã dùng dashboard cùng template UI hiện tại trên Next/React.
- Legacy SvelteKit/Vite source đã được archive ở `legacy/sveltekit/`; Svelte/Vite devDependencies đã được gỡ khỏi package chính.
- Judge/Payer UI là phase còn lại của bản Next conversion.

## Còn thiếu / lưu ý

- UI không mint/faucet SPL token demo; user cần tự có Devnet token balance đúng mint trong token account.
- Storage upload vẫn chỉ là URI input/editable; app không tự upload IPFS/encryption.
- `program.account.task.all()` dùng RPC `getProgramAccounts`, đủ cho Devnet demo nhưng nên thay bằng indexer/pagination khi task nhiều.
- Adapter deploy production chưa cấu hình nền tảng cụ thể; local `dev/build/preview` đã chạy.
