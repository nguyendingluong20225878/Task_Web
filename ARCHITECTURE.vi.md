# KIẾN TRÚC HỆ THỐNG

## 1. Tổng quan

Kiến trúc này định nghĩa các Giai đoạn 2 đến 5 của vòng đời marketplace nhiệm vụ:

- Giai đoạn 2: Stake (Đặt cọc)
- Giai đoạn 3: Submit (Nộp bài)
- Giai đoạn 4: Judge Vote (Giám khảo chấm điểm)
- Giai đoạn 5: Settle (Quyết toán)

Giai đoạn 1, Tạo Nhiệm Vụ, đã thiết lập mẫu thực thi cốt lõi:

- Mỗi giai đoạn đều hỗ trợ `dry-run` và `execute`.
- `dry-run` không bao giờ gửi giao dịch on-chain.
- `dry-run` vẫn ghi bản ghi Atlas DB với `isSimulated = true`.
- `execute` gửi giao dịch Anchor thật, xác nhận, rồi ghi Atlas DB với dữ liệu đã xác nhận.
- Trạng thái chương trình on-chain là nguồn sự thật cho vòng đời nhiệm vụ, escrow, vote và quyết toán.
- Atlas DB là mô hình đọc, nhật ký giao dịch, nhật ký mô phỏng và bộ nhớ đệm vận hành.

Kiến trúc mục tiêu là backend-centric lai với lõi tin cậy on-chain:

- Smart contract sở hữu tiền, trạng thái protocol, kiểm tra quyền và quyết toán cuối cùng.
- Backend xác thực yêu cầu, chuẩn bị context giao dịch, phối hợp lưu trữ và ghi metadata thực thi.
- Indexer ghi snapshot protocol chuẩn vào Atlas từ trạng thái chain đã xác nhận.
- Storage lưu metadata công khai, chi tiết nhiệm vụ mã hóa, bài nộp mã hóa, chỉ cấp quyền truy cập từ bằng chứng on-chain.
- Frontend hoặc caller nên coi DB chỉ là tiện ích tra cứu, không phải nguồn sự thật cuối cùng.

Các vai trò chính:

- Requestor: tạo nhiệm vụ và nạp thưởng.
- Worker: stake để mở khóa chi tiết nhiệm vụ, làm việc, nộp bài mã hóa.
- Judge: chấm bài nếu được chỉ định.
- Keeper/Admin: bảo trì như retry assignment, quyết toán, hủy, hoặc điều phối claim nếu được phép.

Các account và bản ghi cốt lõi:

- `Task`: trạng thái vòng đời chính.
- `WorkerEscrow`: custody stake worker, nếu tách riêng.
- `TaskJudgeAssignment`: trạng thái chỉ định và vote của judge.
- `JudgeRecord` / `JudgeRegistry`: pool judge và điều kiện tham gia.
- `EscrowTokenVault`: custody bounty.
- Atlas `tasks`: cache nhiệm vụ.
- Atlas `judge_assignments`: cache assignment.
- Atlas `transactions`: nhật ký thực thi.
- Atlas transaction intents: hành động pending hoặc yêu cầu, tách biệt với trạng thái protocol cuối cùng.
- Storage objects: metadata/chi tiết/bài nộp bất biến với content hash.

## 2. Máy trạng thái

Vòng đời nhiệm vụ chuẩn:

```text
[Intent tạo off-chain]
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
  |-- settle_payment no-quorum ----------> Inconclusive hoặc reject settlement

Completed
  |-- claim_judge_fee, nếu có -----------> Completed

Failed
  |-- claim_judge_fee, nếu có -----------> Failed

Cancelled
  |-- terminal --------------------------> Cancelled
```

Giải thích trạng thái:

- `Open`: bounty đã khóa, chưa có worker nhận nhiệm vụ.
- `InProgress`: worker đã stake, chỉ worker này được nộp bài.
- `Resolving`: đã có bài nộp, judge có thể vote, chưa quyết toán.
- `Completed`: kết quả được duyệt, worker nhận thưởng.
- `Failed`: kết quả bị từ chối, requestor được hoàn/slash theo rule.
- `Cancelled`: nhiệm vụ bị hủy trước khi quyết toán.
- `Inconclusive` hoặc reject settlement: khi vote sau deadline không đủ quyết định.

Quy tắc quyết toán phải rõ ràng:

- Approved khi `pass_vote_count >= approval_threshold_n`.
- Failed khi `fail_vote_count > required_judges_m - approval_threshold_n`.
- Nếu không, phải reject settlement hoặc chuyển sang trạng thái no-quorum rõ ràng.

Quy tắc này ngăn vote chưa đủ bị coi là kết quả cuối cùng giả.

## 3. Thiết kế các giai đoạn (2 → 5)

### Giai đoạn 2: Stake

Mục đích:

Worker nhận nhiệm vụ open bằng cách khóa stake yêu cầu. Nhiệm vụ chuyển từ `Open` sang `InProgress`.

Input:

- `taskPda`
- `taskId`
- `worker`
- `workerTokenAccount` hoặc tài khoản nguồn stake
- `workerStakeAmount`
- `mode`

Kiểm tra chung:

- Task tồn tại.
- Trạng thái task là `Open`.
- Worker chưa được chỉ định.
- Số stake đúng yêu cầu.
- Chủ tài khoản nguồn là worker.
- Tài sản stake đúng policy.
- Task chưa hết hạn nhận.

Hành vi dry-run:

- Không gửi giao dịch RPC.
- Tính PDA giống execute.
- Tạo chữ ký base58 giả.
- Tạo worker escrow PDA giả hoặc custody stake tương đương.
- Tạo snapshot nhiệm vụ mô phỏng:
  - `status = InProgress`
  - `worker = worker`
  - `lastSignature = fakeSignature`
  - `isSimulated = true`
- Ghi Atlas:
  - cache `tasks` với worker/status mô phỏng.
  - bản ghi `transactions` cho `stake_to_unlock`.
  - optional cache `worker_escrows` nếu có.

Hành vi execute:

- Lấy task account hiện tại từ chain.
- Tính escrow stake worker và các account cần thiết.
- Gọi Anchor `stake_to_unlock`.
- Xác nhận chữ ký.
- Lấy lại task và escrow account đã cập nhật.
- Ghi Atlas từ dữ liệu chain xác nhận:
  - `tasks.status = InProgress`
  - `tasks.worker = worker`
  - transaction signature, slot, commitment, program id
  - `isSimulated = false`

Chuyển trạng thái:

```text
Open -- stake_to_unlock --> InProgress
```

Lưu ý kiến trúc:

Stake phải idempotent theo task và worker. Worker thứ hai stake cùng lúc phải fail on-chain. DB không được pre-assign worker làm nguồn sự thật.

### Giai đoạn 3: Submit

Mục đích:

Worker nộp bài mã hóa, chuyển task sang giải quyết. Judge có thể được chỉ định cùng lúc hoặc bởi keeper sau.

Input:

- `taskPda`
- `worker`
- `encryptedSubmissionUri`
- `submissionHash`
- `mode`

Kiểm tra chung:

- Task tồn tại.
- Trạng thái task là `InProgress`.
- Caller là worker của task.
- Nộp bài trước `submissionDeadline`.
- Đối tượng lưu trữ submission tồn tại và immutable.
- Hash nội dung submission khớp object đã upload.

Điều kiện lưu trữ:

- Submission mã hóa phải upload trước khi tạo giao dịch.
- URI/hash ghi on-chain phải immutable.
- Nếu upload thành công nhưng giao dịch fail, object trở thành orphan, cần job cleanup.

Hành vi dry-run:

- Không gửi giao dịch.
- Mô phỏng storage reference bằng URI/hash immutable đã cung cấp hoặc giả lập.
- Sinh chữ ký giả.
- Mô phỏng snapshot task:
  - `status = Resolving`
  - `encryptedSubmissionUri = encryptedSubmissionUri`
- Nếu assignment là một phần của submit:
  - Mô phỏng judge được chọn.
  - Mô phỏng PDA `TaskJudgeAssignment`.
  - Ghi bản ghi assignment mô phỏng.
- Ghi Atlas với `isSimulated = true`.

Hành vi execute:

- Xác thực worker từ chain hoặc snapshot đã index.
- Gọi Anchor `submit_and_assign` hoặc các instruction tách:
  - `submit_deliverable`
  - `assign_judges`
- Xác nhận chữ ký.
- Lấy lại task account đã cập nhật.
- Lấy assignment account nếu có.
- Ghi Atlas:
  - `tasks.status = Resolving`
  - `tasks.encryptedSubmissionUri`
  - `tasks.assignedJudges`
  - `judge_assignments` nếu có
  - transaction metadata
  - `isSimulated = false`

Chuyển trạng thái:

```text
InProgress -- submit_and_assign --> Resolving
```

Lưu ý kiến trúc:

Thiết kế hiện tại gộp `submit_and_assign` nên worker nộp bài và judge được chỉ định cùng lúc. Để đảm bảo reliability, việc tạo assignment nên:

- atomic trong cùng giao dịch,
- retry bởi keeper cho đến khi đủ assignment,
- hoặc khởi tạo lazy khi judge vote.

Hệ thống phải tránh task `Resolving` mà thiếu assignment judge.

### Giai đoạn 4: Judge Vote

Mục đích:

Judge được chỉ định vote cho bài nộp. Vote cập nhật trạng thái assignment và bộ đếm vote của task.

Input:

- `taskPda`
- `taskId`
- `judge`
- `assignmentPda`
- `vote = pass | fail`
- optional `voteMetadataUri` hoặc `voteHash`
- `mode`

Kiểm tra chung:

- Task tồn tại.
- Trạng thái task là `Resolving`.
- Assignment judge tồn tại.
- Judge được chỉ định cho task này.
- Judge chưa vote.
- Vote trước `votingDeadline`.
- Judge đang active hoặc active lúc assignment, tùy policy.
- Judge không được là requestor hoặc worker nếu policy cấm.

Hành vi dry-run:

- Không gửi giao dịch.
- Sinh chữ ký giả.
- Mô phỏng update assignment:
  - `hasVoted = true`
  - `vote = pass | fail`
  - `votedAt = simulated now`
- Mô phỏng bộ đếm vote task:
  - tăng `passVoteCount` hoặc `failVoteCount`
- Ghi Atlas:
  - `judge_assignments`
  - `tasks`
  - `transactions`
  - `isSimulated = true`

Hành vi execute:

- Lấy task và assignment account.
- Gọi Anchor `judge_vote(is_pass)`.
- Xác nhận chữ ký.
- Lấy lại task và assignment account đã cập nhật.
- Ghi Atlas:
  - cập nhật bộ đếm vote
  - trạng thái vote assignment
  - transaction metadata
  - `isSimulated = false`

Chuyển trạng thái:

```text
Resolving -- judge_vote --> Resolving
```

Lưu ý kiến trúc:

Vote không được chuyển tiền. Chỉ thay đổi bằng chứng cho quyết toán. Không thể double vote hoặc vote không được chỉ định on-chain.

### Giai đoạn 5: Settle

Mục đích:

Chốt kết quả nhiệm vụ và chuyển tiền từ escrow theo kết quả vote.

Input:

- `taskPda`
- settlement authority hoặc keeper
- tài khoản nhận payout/refund của requestor
- tài khoản nhận payout của worker
- các account vault escrow
- account judge fee/vault
- `mode`

Kiểm tra chung:

- Task tồn tại.
- Trạng thái task là `Resolving`.
- Kết quả đủ điều kiện quyết toán, hoặc deadline/no-quorum cho phép hành động rõ ràng.
- Chưa quyết toán trước đó.
- Tài khoản token đúng mint và chủ sở hữu.
- Số dư vault đủ.
- Fee không vượt quá escrow.

Hành vi dry-run:

- Không gửi giao dịch.
- Tính kết quả mô phỏng theo rule quyết toán như execute.
- Sinh chữ ký giả.
- Mô phỏng trạng thái task cuối:
  - approved -> `Completed`
  - rejected -> `Failed`
  - no-quorum -> reject dry-run hoặc mô phỏng `Inconclusive`
- Mô phỏng tổng kết quyết toán:
  - bounty gross amount
  - judge fee reserved
  - worker payout
  - requestor refund
  - worker stake returned
  - worker stake slashed
  - remaining vault dust
- Ghi Atlas:
  - trạng thái task cuối mô phỏng
  - bản ghi transaction
  - optional cache `settlements`
  - `isSimulated = true`

Hành vi execute:

- Lấy task, vault, worker escrow, assignment/vote state.
- Gọi Anchor `settle_payment`.
- Xác nhận chữ ký.
- Lấy lại task account cuối cùng.
- Lấy số dư vault liên quan để đối soát.
- Ghi Atlas:
  - snapshot task cuối từ chain
  - transaction metadata
  - tổng kết quyết toán từ số dư xác nhận
  - `isSimulated = false`

Chuyển trạng thái:

```text
Resolving -- settle_payment approved --> Completed
Resolving -- settle_payment rejected --> Failed
Resolving -- settle_payment no-quorum --> Inconclusive hoặc reject transaction
```

Lưu ý kiến trúc:

Quyết toán là giai đoạn rủi ro nhất. DB không bao giờ được tự quyết định payout cuối cùng. Có thể tính preview ở dry-run, nhưng execute phải tin trạng thái chain xác nhận.

## 4. Sơ đồ dòng tiền (text)

### Các container tiền

```text
Tài khoản Token Requestor
Tài khoản Token Worker
Tài khoản nguồn Stake Worker
Vault Escrow Bounty Task
Escrow Stake Worker
Reserve/Accounting Judge Fee
Tài khoản nhận Judge Fee
```

### Giai đoạn 1: Tạo Nhiệm Vụ (đã có)

```text
Tài khoản Token Requestor
  -- bounty_amount -->
Vault Escrow Bounty Task

Trạng thái Task:
  none -> Open
```

Hiệu ứng:

- Requestor nạp bounty.
- Vault escrow bounty là tài khoản custody cho payout hoặc refund.
- Chưa có stake worker.
- Chưa trả judge fee, nhưng `judge_fee_bps` đã ghi từ config.

### Giai đoạn 2: Stake

```text
Tài khoản nguồn Stake Worker
  -- worker_stake_amount -->
Escrow Stake Worker

Task:
  worker = Worker
  status = InProgress
```

Hiệu ứng:

- Worker stake bị khóa.
- Worker được quyền truy cập chi tiết nhiệm vụ mã hóa qua policy lưu trữ.
- Task không còn cho worker khác nhận.

Hành vi race/fail:

```text
Worker A stake trước:
  Task.worker = Worker A
  Task.status = InProgress

Worker B stake sau:
  bị reject on-chain vì task không còn Open
```

DB có thể ghi nhận stake pending, nhưng chỉ trạng thái chain xác nhận mới quyết định.

### Giai đoạn 3: Submit

```text
Không chuyển token.

Storage:
  Bài nộp mã hóa của Worker
    -> URI/hash immutable
    -> URI/hash được tham chiếu bởi trạng thái submission của task

Task:
  status = Resolving
```

Hiệu ứng:

- Worker chưa nhận bounty.
- Stake worker vẫn bị khóa.
- Bounty vẫn ở escrow task.
- Judges chỉ được xem submission mã hóa sau khi có bằng chứng assignment.

Lưu ý rủi ro lưu trữ:

- Nếu upload submission thành công nhưng giao dịch chain fail, không có giá trị protocol nào bị chuyển.
- Object upload trở thành orphan, không được cấp quyền truy cập nếu không có bằng chứng on-chain.

### Giai đoạn 4: Vote

```text
Không chuyển token.

Assignment Judge:
  hasVoted = true
  vote = pass | fail

Task:
  passVoteCount += 1
  hoặc
  failVoteCount += 1
```

Hiệu ứng:

- Bounty vẫn ở escrow.
- Stake worker vẫn bị khóa.
- Judge fee chưa trả khi vote.
- Trạng thái vote góp phần quyết toán.

Lưu ý incentive judge:

- Judge fee chỉ claim được nếu judge đủ điều kiện:
  - được chỉ định,
  - đã vote,
  - ở phía thắng hoặc đủ điều kiện theo policy,
  - chưa claim.

### Giai đoạn 5A: Settle approved

Điều kiện approved:

```text
pass_vote_count >= approval_threshold_n
```

Mô hình payout đề xuất:

```text
Vault Escrow Bounty Task
  -- judge_fee_total_reserved -->
Reserve/Accounting Judge Fee

Vault Escrow Bounty Task
  -- bounty_amount - judge_fee_total_reserved -->
Tài khoản Token Worker

Escrow Stake Worker
  -- worker_stake_amount -->
Tài khoản nguồn/payout Stake Worker

Reserve Judge Fee
  -- fee_per_eligible_judge -->
Tài khoản nhận Judge
```

Trạng thái task cuối:

```text
Resolving -> Completed
```

Hiệu ứng:

- Worker nhận bounty trừ judge fee nếu có.
- Stake worker được trả lại.
- Judge fee có thể claim hoặc trả tùy thiết kế contract.
- Requestor không được refund.

Invariants:

```text
bounty_amount =
  worker_payout
  + total_judge_fee_reserved
  + protocol_fee_if_any
  + dust_if_any

worker_stake_amount =
  worker_stake_returned
```

### Giai đoạn 5B: Settle rejected

Điều kiện rejected:

```text
fail_vote_count > required_judges_m - approval_threshold_n
```

Mô hình payout đề xuất:

```text
Vault Escrow Bounty Task
  -- judge_fee_total_reserved -->
Reserve/Accounting Judge Fee

Vault Escrow Bounty Task
  -- bounty_amount - judge_fee_total_reserved -->
Tài khoản Token Requestor

Escrow Stake Worker
  -- slashed_amount -->
Slash Recipient/Reserve Judge Fee/Treasury Protocol

Escrow Stake Worker
  -- returned_amount, nếu policy cho phép -->
Tài khoản Token Worker

Reserve Judge Fee
  -- fee_per_eligible_judge -->
Tài khoản nhận Judge
```

Trạng thái task cuối:

```text
Resolving -> Failed
```

Hiệu ứng:

- Requestor được refund bounty trừ fee nếu có.
- Stake worker bị slash hoặc trả lại một phần theo policy.
- Judge fee có thể claim hoặc trả.

Invariants:

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

### Giai đoạn 5C: No quorum hoặc inconclusive

Điều kiện no-quorum:

```text
pass_vote_count < approval_threshold_n
và
fail_vote_count <= required_judges_m - approval_threshold_n
và
votingDeadline đã qua
```

Hai lựa chọn kiến trúc:

Option A, reject settlement:

```text
settle_payment -> rejected
Task vẫn Resolving
Keeper/Admin phải xử lý theo policy riêng
```

Option B, trạng thái terminal rõ ràng:

```text
Resolving -> Inconclusive / ExpiredNoQuorum
```

Khi đó policy tiền phải rõ ràng:

```text
Vault Escrow Bounty Task -> Requestor refund hoặc chia theo protocol
Escrow Stake Worker -> Worker trả lại hoặc slash theo protocol
Judge fee -> chỉ voters, tất cả judge assigned, hoặc không ai nhận
```

Kiến trúc hiện tại không nên tự động map no-quorum thành `Failed`.

### Policy fee và dust

Công thức judge fee nên deterministic:

```text
total_judge_fee_reserved = floor(bounty_amount * judge_fee_bps / 10000)
fee_per_judge = floor(total_judge_fee_reserved / eligible_judge_count)
dust = total_judge_fee_reserved - fee_per_judge * eligible_judge_count
```

Policy dust phải rõ ràng:

- trả lại requestor,
- trả worker nếu approved,
- giữ ở protocol treasury,
- hoặc để lại vault nếu có thể thu hồi.

Rule làm tròn phải giống nhau ở dry-run và execute.

## 5. Phân chia on-chain và off-chain

### Trách nhiệm on-chain

Smart contract sở hữu mọi sự thật quan trọng:

- Trạng thái vòng đời task.
- Custody bounty escrow.
- Custody stake worker.
- Worker của task.
- Trạng thái submission.
- Tính hợp lệ assignment judge.
- Tính hợp lệ vote.
- Bộ đếm vote.
- Quyết toán.
- Chuyển token.
- Judge fee reserve và claim.
- Ngăn double-action:
  - double stake,
  - double submit,
  - double vote,
  - double settle,
  - double judge fee claim.
- Ràng buộc tài khoản token:
  - owner,
  - mint,
  - vault authority,
  - PDA seeds.

Contract phải reject:

- sai trạng thái task,
- sai actor,
- sai token mint,
- sai chủ token,
- vote judge không được chỉ định,
- vote trùng,
- settle sớm,
- settle no-quorum nếu không hỗ trợ,
- settle lặp lại,
- hủy hoặc admin không đúng quyền.

### Trách nhiệm backend

Backend cải thiện UX và an toàn, nhưng không được là nguồn sự thật protocol.

Trách nhiệm:

- Xác thực hình dạng request.
- Chuẩn hóa tham số phase.
- Xây dựng context giao dịch.
- Kiểm tra stale-state trước hành động rủi ro.
- Phối hợp upload storage trước create/submit.
- Ghi intent giao dịch tách biệt với trạng thái đã index.
- Ghi dry-run với `isSimulated = true`.
- Ghi metadata submit/confirm execute.
- Cung cấp API đọc từ cache Atlas.
- Chuẩn hóa taxonomy lỗi:
  - validation error,
  - simulation error,
  - stale index,
  - RPC timeout,
  - submitted but not confirmed,
  - confirmed failure.

Backend không được:

- đánh dấu trạng thái task cuối cùng là authoritative,
- cấp quyền đọc private từ DB-only proof,
- tính toán quyết toán cuối cùng làm authority,
- mutate trạng thái protocol đã index mà không có slot/signature/commitment,
- ẩn settle fail hoặc inconclusive sau khi DB write thành công.

### Trách nhiệm indexer

Indexer là writer chuẩn của snapshot read-model đã xác nhận.

Trách nhiệm:

- Poll hoặc subscribe các account liên quan:
  - `Task`,
  - `WorkerEscrow`,
  - `JudgeRecord`,
  - `TaskJudgeAssignment`,
  - `SystemConfig`,
  - vault khi cần.
- Giải mã account.
- Upsert bản ghi Atlas với:
  - PDA,
  - slot,
  - signature,
  - commitment,
  - program id,
  - payload đã decode,
  - updated timestamp.
- Đánh dấu intent là observed, confirmed, failed, hoặc stale.
- Đối soát số dư vault và snapshot DB.
- Hỗ trợ rebuild từ deployment slot.

Indexer phải idempotent:

- event lặp không được tạo bản ghi DB lặp,
- snapshot slot thấp không được ghi đè snapshot mới hơn,
- quan sát giao dịch lặp phải quy về một bản ghi.

### Logic schema Atlas DB

Atlas là cache và lớp audit, không phải nguồn sự thật protocol.

Các collection đề xuất:

#### `tasks`

Mục đích:

Cache account task đã index và bản ghi dry-run mô phỏng.

Trường:

```text
taskPda
id
isSimulated
requestor
worker
tokenMint
escrowTokenVault
nftAsset
bountyAmount
judgeFeeBps
workerStakeAmount
requiredJudgesM
approvalThresholdN
passVoteCount
failVoteCount
assignedJudges
publicMetadataUri
encryptedTaskDetailUri
encryptedSubmissionUri
status
createdAt
submissionDeadline
votingDeadline
lastSignature
lastIndexedSlot
lastIndexedCommitment
programId
decodedAccount
updatedAt
```

Index quan trọng:

```text
unique(taskPda, isSimulated)
unique(id, isSimulated)
status + createdAt
requestor + createdAt
worker + updatedAt
assignedJudges + status
lastIndexedSlot
```

Lưu ý thiết kế:

Nếu bản ghi mô phỏng và thật dùng chung `taskPda`, index phải gồm `isSimulated`, hoặc lưu riêng collection. API production nên exclude `isSimulated = true` mặc định.

#### `transactions`

Mục đích:

Nhật ký thực thi cho dry-run và execute.

Trường:

```text
signature
isSimulated
instruction
phase
taskPda
actor
status
slot
commitment
error
createdAt
confirmedAt
```

Status:

```text
simulated
pending_signature
submitted
confirmed
failed
expired
stale_index
```

#### `transaction_intents`

Mục đích:

Ghi nhận hành động yêu cầu trước khi quan sát chain.

Trường:

```text
intentId
phase
instruction
mode
actor
wallet
taskPda
paramsHash
storageRefs
status
signature
errorCode
createdAt
updatedAt
expiresAt
```

Lưu ý thiết kế:

Intent phải tách biệt với trạng thái task cuối. Intent thành công nghĩa là đã chuẩn bị/gửi action, không phải protocol đã đổi trạng thái.

#### `judge_assignments`

Mục đích:

Cache assignment và vote đã index.

Trường:

```text
assignmentPda
taskPda
taskId
judge
assignedOrder
assignedAt
hasVoted
vote
votedAt
hasClaimedFee
feeAmount
isSimulated
lastSignature
lastIndexedSlot
updatedAt
```

#### `worker_escrows`

Mục đích:

Cache custody stake worker (nếu có).

Trường:

```text
escrowPda
taskPda
taskId
worker
stakeAmount
tokenMint
status
isSimulated
lastSignature
lastIndexedSlot
updatedAt
```

Status:

```text
locked
returned
slashed
closed
```

#### `settlements`

Mục đích:

Audit và reconciliation quyết toán.

Trường:

```text
settlementId
taskPda
result
isSimulated
signature
slot
bountyAmount
workerPayout
requestorRefund
judgeFeeReserved
feePerJudge
workerStakeReturned
workerStakeSlashed
dustAmount
tokenMint
balanceBefore
balanceAfter
createdAt
```

Lưu ý thiết kế:

Bản ghi settlement được derive từ chain và đối soát số dư token. Chỉ là audit, không phải authority.

#### `storage_objects`

Mục đích:

Theo dõi object metadata/detail/submission đã upload.

Trường:

```text
objectId
kind
uri
contentHash
encryptionEnvelopeId
owner
taskPda
referencedOnChain
referencedSignature
isOrphaned
createdAt
expiresAt
```

Kind:

```text
public_metadata
encrypted_task_detail
encrypted_submission
vote_metadata
```

### Trách nhiệm storage

Storage quản lý tính sẵn sàng và bảo mật dữ liệu, không phải sự thật protocol.

Metadata công khai:

- Lưu dưới dạng URI bất biến hoặc object theo content-address.
- Đọc công khai an toàn.
- URI/hash có thể tham chiếu bởi metadata task.

Chi tiết nhiệm vụ mã hóa:

- Upload trước khi tạo task hoặc cùng flow create.
- Mã hóa phía client hoặc backend theo envelope policy.
- Worker chỉ truy cập sau khi có bằng chứng stake thành công on-chain.

Submission mã hóa:

- Upload trước khi submit transaction.
- URI/hash được tham chiếu bởi instruction submit.
- Judge được chỉ định chỉ truy cập sau khi có bằng chứng assignment on-chain.
- Requestor truy cập sau settlement hoặc theo policy.

Quy tắc cấp quyền truy cập:

```text
Worker đọc chi tiết nhiệm vụ:
  require Task.status in InProgress/Resolving/Completed/Failed
  require Task.worker == worker
  require stake proof từ chain hoặc snapshot đã index

Judge đọc submission:
  require Task.status == Resolving hoặc review terminal
  require TaskJudgeAssignment.judge == judge
  require assignment tồn tại on-chain hoặc snapshot đã index

Requestor đọc submission:
  require Task.requestor == requestor
  require settlement hoặc policy cho phép review sớm
```

Storage không được cấp quyền đọc private từ:

- chỉ identity ví chưa ký,
- trạng thái DB-only optimistic,
- intent giao dịch pending,
- trạng thái dry-run mô phỏng.

Cleanup orphan:

- Nếu upload storage thành công nhưng giao dịch fail/expire, đánh dấu object orphan.
- Object orphan không được đọc.
- Cleanup có thể xóa hoặc expire object sau thời gian giữ.

### Hành vi dry-run vs execute

Yêu cầu chung:

- Cùng shape tham số.
- Cùng PDA derivation.
- Cùng rule validate nếu có thể.
- Cùng shape kết quả.
- Cùng shape DB write.
- Khác biệt duy nhất là transaction boundary.

Dry-run:

```text
validate input
tính account cần thiết
mô phỏng chuyển trạng thái
mô phỏng preview tiền
sinh chữ ký giả
ghi Atlas với isSimulated = true
không gọi sendTransaction/rpc
không xác nhận chữ ký
không cấp quyền storage
```

Execute:

```text
validate input
lấy lại trạng thái chain trước hành động rủi ro
tính account cần thiết
gửi giao dịch Anchor
xác nhận chữ ký
lấy lại account on-chain đã cập nhật
ghi Atlas với isSimulated = false
indexer sau đó reconcile snapshot chuẩn
chỉ cấp quyền storage sau khi có bằng chứng
```

Giới hạn dry-run:

- Dry-run chỉ ước lượng payout, không chứng minh số dư.
- Dry-run chỉ mô phỏng assignment, không cấp quyền judge.
- Dry-run chỉ mô phỏng stake worker, không cấp quyền đọc chi tiết nhiệm vụ.
- Bản ghi dry-run phải được filter khỏi view production trừ khi yêu cầu rõ.

## 6. Rủi ro / Lưu ý thiết kế

### Đúng quyết toán

Rủi ro:

Vote chưa đủ sau deadline có thể bị coi là `Failed`.

Lưu ý:

Quyết toán phải dùng điều kiện toán học rõ ràng. No-quorum phải reject hoặc chuyển trạng thái rõ ràng với policy tiền cụ thể.

### DB authority drift

Rủi ro:

Ghi DB trực tiếp có thể làm UI tin rằng đã có trạng thái cuối trước khi chain xác nhận.

Lưu ý:

Trạng thái cuối DB phải do indexer ghi với slot, signature, commitment, program id, payload decode. Backend chỉ ghi intent và log, không được ghi trạng thái cuối authoritative.

### Dry-run pollution

Rủi ro:

Bản ghi mô phỏng có thể trùng với bản ghi thật nếu dùng chung task id hoặc PDA.

Lưu ý:

Dùng `isSimulated` trong unique index hoặc lưu riêng collection. API production nên exclude `isSimulated = true` mặc định.

### Độ tin cậy assignment

Rủi ro:

Task `Resolving` có thể thiếu account assignment judge.

Lưu ý:

Tạo assignment nên atomic, retryable bởi keeper, hoặc lazy khi judge vote. Indexer nên flag assignment thiếu để reconcile.

### Thay thế tài khoản token

Rủi ro:

Caller có thể truyền tài khoản token sai owner hoặc mint.

Lưu ý:

Mỗi phase execute phải enforce owner, mint, vault authority, PDA on-chain. Backend validate hữu ích nhưng không đủ.

### Rò rỉ storage

Rủi ro:

Chi tiết nhiệm vụ hoặc submission private có thể bị lộ từ trạng thái DB cũ hoặc mô phỏng.

Lưu ý:

Chỉ cấp quyền storage khi có bằng chứng on-chain hoặc snapshot đã index. Dry-run và intent pending không bao giờ cấp quyền.

### Mô hình tài sản hỗn hợp

Rủi ro:

Bounty và stake có thể dùng tài sản khác nhau hoặc unclear SOL/SPL.

Lưu ý:

Protocol phải định nghĩa rõ bounty, stake, judge fee dùng SPL mint, SOL, hay tài sản riêng. Rule fee, slash, refund, dust phải theo mô hình tài sản đó.

### Race condition

Các trường hợp rủi ro:

- hai worker stake cùng lúc,
- worker submit khi cancel,
- judge vote khi settle,
- hai keeper settle cùng lúc,
- judge claim fee hai lần.

Lưu ý:

Chuyển trạng thái on-chain phải reject stale state. Backend/indexer nên expose pending state riêng, nhưng concurrency safety thuộc về on-chain.

### Indexer lag

Rủi ro:

UI/API có thể dùng trạng thái Atlas cũ.

Lưu ý:

Hành động rủi ro nên lấy lại trạng thái chain hoặc enforce freshness. UI nên phân biệt pending signature, confirmed signature, và trạng thái đã index.

### Random judge selection

Rủi ro:

Randomness dựa blockhash có thể bị thao túng.

Lưu ý:

Sản phẩm thực nên dùng VRF hoặc commit-reveal. Nếu randomness hiện tại chỉ MVP, config deploy phải ngăn dùng thật.

### Admin authority

Rủi ro:

Admin key hardcode không an toàn cho production.

Lưu ý:

Chuyển quyền admin vào config hoặc multisig. Thay đổi admin/protocol config phải audit được.

### Reconciliation

Rủi ro:

Snapshot DB, log giao dịch, số dư vault có thể lệch.

Lưu ý:

Chạy job reconcile so sánh cache Atlas với account chain và số dư token. Nếu lệch, flag, sửa hoặc cách ly.

### Idempotency

Rủi ro:

Retry có thể tạo bản ghi trùng hoặc ghi đè trạng thái mới hơn.

Lưu ý:

Dùng key deterministic:

- task theo `taskPda`,
- assignment theo `assignmentPda`,
- transaction theo `signature`,
- intent theo `intentId`,
- settlement theo `taskPda + signature`.

Không bao giờ để data slot thấp ghi đè snapshot slot cao hơn.