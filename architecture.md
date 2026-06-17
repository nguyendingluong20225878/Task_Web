# 🧭 SYSTEM OVERVIEW

Task hiện là một Solana/Anchor protocol cho marketplace task AI agent. Kiến trúc production đúng nên là **hybrid backend-centric, on-chain trust core**:

```text
Frontend
  -> Backend API
      -> Storage
      -> MongoDB/Postgres read model
      -> Transaction builder / relayer boundary
  -> Wallet signs user-owned transactions

Backend API / Worker jobs
  -> Solana RPC
  -> Anchor program: programs/task_web

Indexer
  -> Solana accounts/events/transactions
  -> DB read model

Smart Contract / Solana Program
  -> Source of truth for escrow, stake, task lifecycle, judge votes, settlement
```

Điểm quan trọng: backend có thể điều phối workflow, nhưng **không được là authority cuối cho tiền, stake, vote, task status, hoặc settlement**. Các authority đó đang và nên nằm trong Anchor program `task_contract`.

Repo hiện tại chưa phải hệ thống production đầy đủ. Nó đang có:

- Smart Contract: `programs/task_web`
- Contract tests: `tests/task_web.ts`
- DB cache layer: `app/db`
- Tài liệu: `docs/Task-current-architecture-summary.md`, `docs/Task-whitepaper.md`, `docs/Task-architecture.md`
- Chưa có frontend app production
- Chưa có backend API service production
- Chưa có storage adapter production
- Chưa có indexer service production

Kiến trúc production cần tách rõ hai mặt:

- **Command path**: user/action tạo transaction, wallet ký, program validate và mutate state.
- **Query path**: frontend đọc từ API/DB cache đã index từ chain, có fallback hoặc reconciliation từ RPC.

# 🧱 COMPONENT BREAKDOWN

## Frontend

Trách nhiệm production:

- Hiển thị marketplace task, trạng thái task, judge assignment, transaction history.
- Kết nối wallet cho Requestor, Worker, Judge, Admin.
- Gửi request tới Backend API để lấy quote, metadata, upload URLs, transaction draft.
- Ký transaction bằng wallet khi action cần signer thật.
- Không tự quyết định trạng thái task.
- Không tin DB như source of truth cho settlement.

Actions frontend cần hỗ trợ:

- Requestor: create task, cancel open task, cancel expired task, xem deliverable sau settle.
- Worker: stake to unlock, submit encrypted deliverable.
- Judge: register/unregister, vote, claim fee.
- Any actor/API keeper: trigger settle khi đủ điều kiện.

Frontend hiện chưa có trong repo, nên mọi UI/role flow trong tài liệu hiện là target architecture, không phải implemented component.

## Backend API

Trách nhiệm production:

- Validate request ở tầng application: schema, file size, metadata shape, deadline UX, role pre-check.
- Upload metadata/payload/deliverable lên Storage.
- Tạo transaction hoặc instruction bundle cho frontend ký.
- Ghi transaction intent và tracking record vào DB.
- Trả read API cho frontend từ indexed DB.
- Chạy maintenance job: retry index, reconcile cache, propose settle/cancel transaction khi đủ điều kiện.

Backend không được:

- Tự set `Completed`, `Failed`, `Cancelled` làm final state nếu chưa index được từ chain.
- Tự quyết định worker pass/fail.
- Tự chia bounty, stake, judge fee.
- Giữ private key của user để ký thay user trong production, trừ các service account được định nghĩa rõ như keeper/admin.

Backend hiện chưa có service trong repo. `app/db` mới là Mongo cache/repository layer, không phải API.

## Smart Contract / Solana Program

Implemented tại `programs/task_web`.

Source of truth hiện có:

- `Task` account trong `state/task.rs`
- `WorkerEscrow` trong `state/escrow.rs`
- `JudgeRegistry`, `JudgeRecord`, `JudgeStakeVault` trong `state/judge_pool.rs`
- `SystemConfig` trong `state/system.rs`
- SPL token vault cho bounty
- Metaplex Core asset đại diện task

Instructions hiện có:

- `admin_init_protocol`
- `judge_register`
- `judge_unregister`
- `initialize_task`
- `cancel_open_task`
- `stake_to_unlock`
- `submit_and_assign`
- `init_judge_assignment`
- `judge_vote`
- `settle_payment`
- `claim_judge_fee`
- `cancel_expired_task`

Contract nên giữ authority cho:

- Bounty escrow
- Worker stake lock/release/slash
- Judge registry/stake lock ở mức protocol v1
- Task status lifecycle
- Submission URI proof
- Judge vote proof
- Settlement calculation
- Judge fee claim

## Database

Hiện có MongoDB cache layer tại `app/db`.

Collections:

- `tasks`
- `judges`
- `judge_assignments`
- `transactions`

DB production role:

- Read model cho frontend/API.
- Cache/index từ on-chain accounts.
- Search/filter/listing.
- Transaction observability.
- Debug và reconciliation.

DB không phải source of truth cho:

- `Task.status`
- `pass_vote_count` / `fail_vote_count`
- `worker`
- escrow balance
- stake released/slashed
- judge fee claim
- settlement result

Nếu DB lệch chain, chain thắng. DB phải rebuild được từ chain.

## Storage

Storage production cần là service riêng hoặc adapter rõ ràng.

Nên lưu:

- Public metadata: title, summary, requirements public, tags, display fields.
- Encrypted task detail: input thật, private instruction, rubric chi tiết nếu cần.
- Encrypted submission: deliverable của worker.

On-chain chỉ lưu URI bounded string:

- `public_metadata_uri`
- `encrypted_task_detail_uri`
- `encrypted_submission_uri`

Storage không được là authority cho task lifecycle. Nếu file tồn tại nhưng URI chưa được ghi on-chain qua instruction hợp lệ, file đó chưa có giá trị protocol.

Production cần thêm:

- Content hash/CID hoặc checksum.
- Object immutability hoặc versioning.
- Access control theo role.
- Key management rõ: requestor, worker, judge, backend không lẫn vai.

## Indexer

Indexer hiện chưa có implementation riêng. Production cần có service tách khỏi API request path.

Trách nhiệm:

- Subscribe/fetch `Task`, `TaskJudgeAssignment`, `JudgeRecord`, `SystemConfig`.
- Index transaction signatures theo instruction.
- Upsert Mongo/Postgres read model.
- Reconcile định kỳ: DB record vs account state vs vault balances.
- Xử lý reorg/finality theo commitment policy.
- Có thể rebuild DB từ genesis slot hoặc deployment slot.

Indexer không được mutate business state bằng DB. Nếu cần trigger settle/cancel, nó chỉ gửi transaction tới program như một keeper, và kết quả vẫn phải được index lại từ chain.

# 🔄 DATA FLOW

## Create

Production flow đúng:

1. Requestor nhập task metadata, bounty, stake amount, deadlines, judge config.
2. Backend validate schema và upload:
   - public metadata -> Storage
   - encrypted task detail -> Storage
3. Backend tạo transaction gọi `initialize_task`.
4. Requestor wallet ký transaction.
5. Program:
   - tạo `Task` PDA bằng seed `["task", id]`
   - tạo SPL escrow token vault bằng seed `["vault", task]`
   - transfer `bounty_amount` từ requestor token account vào vault
   - tạo Metaplex Core asset
   - set `Task.status = Open`
   - lưu public/encrypted URI
6. Indexer đọc account/tx và upsert `tasks`.
7. Frontend đọc task listing từ API/DB cache.

Authority:

- Bounty lock: Smart Contract
- Task status `Open`: Smart Contract
- Metadata content: Storage
- Listing/search: DB cache

Vấn đề hiện tại:

- `initialize_task` nhận cả `encrypted_submission_uri` dù lúc create chưa có submission. Production nên để rỗng/default hoặc bỏ khỏi create path.
- Task id là input client/backend. Production cần policy chống collision/replay rõ: monotonic counter on-chain, backend reservation, hoặc deterministic UUID mapped sang PDA.

## Stake

Production flow đúng:

1. Worker đọc task `Open` từ API.
2. Backend/Frontend fetch lại chain state trước khi build tx.
3. Worker wallet ký `stake_to_unlock`.
4. Program:
   - require `task.status == Open`
   - tạo `WorkerEscrow` bằng seed `["escrow", task.id, worker]`
   - transfer SOL stake từ worker vào worker escrow PDA
   - set `task.worker = worker`
   - set `task.status = InProgress`
5. Backend cấp quyền truy cập encrypted task detail theo policy key management.
6. Indexer update DB.

Authority:

- Worker assignment: Smart Contract
- Stake lock: Smart Contract
- Access/key release: Backend/Storage/KMS, dựa trên on-chain proof

Vấn đề hiện tại:

- Stake worker đang dùng SOL transfer vào program-owned account, bounty dùng SPL token vault. Production cần nói rõ tài sản stake là SOL hay SPL token; không để hai model gây nhầm kế toán.
- Key release chưa có implementation. Nếu backend tự tin DB `InProgress` mà chưa verify chain, có thể cấp task detail sai.

## Submit

Production flow đúng:

1. Worker upload encrypted deliverable lên Storage.
2. Backend trả URI/hash.
3. Worker ký `submit_and_assign(encrypted_submission_uri)`.
4. Program:
   - require signer là `task.worker`
   - require `task.status == InProgress`
   - require current time <= `submission_deadline`
   - lưu `encrypted_submission_uri`
   - chọn assigned judges từ `JudgeRegistry`
   - update judge record assignment count/lock
   - set `task.status = Resolving`
5. `init_judge_assignment` được gọi cho từng judge để tạo `TaskJudgeAssignment`.
6. Indexer cập nhật task và assignments.

Authority:

- Submission proof URI: Smart Contract
- Judge assigned list: Smart Contract hiện tại
- Deliverable bytes: Storage

Vấn đề hiện tại:

- `submit_and_assign` đang ghép hai việc: submit deliverable và chọn judge. Production có thể giữ nếu muốn trustless assignment, nhưng boundary phải rõ vì backend không còn quyền chọn judge.
- Randomness hiện là `BlockhashMvp`. Đây là demo-grade, không đủ production nếu judge selection ảnh hưởng tiền.
- `init_judge_assignment` là bước riêng sau khi `submit_and_assign` đã ghi `assigned_judges`. Nếu không có keeper/API gọi đủ assignment accounts, judge vote/claim flow có thể kẹt.

## Judge

Production flow đúng:

1. Judge đọc assignment từ API/indexed DB.
2. Backend/Storage cho judge truy cập encrypted submission/key theo proof `assigned_judges`.
3. Judge đánh giá deliverable.
4. Judge wallet ký `judge_vote(is_pass)`.
5. Program:
   - require judge signer có `JudgeRecord`
   - require judge nằm trong `task.assigned_judges`
   - require `TaskJudgeAssignment` tồn tại
   - require chưa vote
   - require current time <= `voting_deadline`
   - tăng `pass_vote_count` hoặc `fail_vote_count`
6. Indexer cập nhật DB.

Authority:

- Vote proof: Smart Contract
- Vote count: Smart Contract
- Judge assignment display: DB cache

Vấn đề hiện tại:

- Vote chỉ là boolean pass/fail. Rubric, reason, score, evidence chưa có chỗ production-grade. Nếu cần audit, vote metadata hash/URI nên được thêm.
- Judge reputation/slashing chưa được định nghĩa, dù whitepaper có nói production nên có.

## Settle

Production flow đúng:

1. Backend keeper, frontend, requestor, worker hoặc bất kỳ actor hợp lệ gọi settle khi:
   - đủ `required_judges_m` vote, hoặc
   - quá `voting_deadline` và rule partial vote cho phép kết luận.
2. Transaction gọi `settle_payment`.
3. Program:
   - kiểm tra task đang `Resolving`
   - tính approved/fail từ `pass_vote_count`, `fail_vote_count`, `approval_threshold_n`
   - reserve judge fee cho nhóm vote đúng
   - nếu approved: bounty còn lại -> worker token account, status `Completed`
   - nếu failed: bounty còn lại -> requestor token account, status `Failed`
   - release hoặc slash worker stake theo rule
   - transfer NFT/task asset về requestor
4. Judge vote đúng gọi `claim_judge_fee`.
5. Indexer sync DB.

Authority:

- Settlement result: Smart Contract
- Token transfer: Smart Contract/SPL token program
- Judge fee eligibility: Smart Contract
- UI final state: DB cache derived from chain

Vấn đề hiện tại:

- `settle_payment` cho phép settle khi `votes_cast == required_judges_m` hoặc `current_time > voting_deadline`. Nếu hết deadline với partial votes không đủ kết luận, code vẫn dùng `is_approved = pass_vote_count >= threshold` và có thể fail task. Biến `definitely_failed` chỉ ảnh hưởng slash stake, không chặn settlement mơ hồ.
- `payer` trong settle là signer nhưng không bị ràng buộc role. Điều này hợp lý nếu settle permissionless, nhưng tài liệu production phải chốt là permissionless keeper hay role-bound.
- Judge fee claim tách riêng, nên vault phải giữ đủ reserved fee sau settle. Indexer cần track `judge_fee_claimed`.

# ⚠️ ARCHITECTURE ISSUES

## 1. Backend được mô tả như "core brain" quá rộng

Tài liệu hiện tại nói Backend API là trung tâm workflow. Cách nói này nguy hiểm nếu không kèm boundary.

Đúng cho production:

- Backend là orchestrator của UX, metadata, transaction building, cache, storage.
- Smart Contract là authority của state machine và tiền.

Sai nếu hiểu rằng backend quyết định:

- task pass/fail
- worker được bounty hay bị slash
- judge vote hợp lệ hay không
- task đã completed/failed chưa

## 2. Chưa có Backend API thật

Repo hiện chỉ có `app/db`. Không có route/controller/service layer. Vì vậy mọi mô tả `Frontend -> Backend API -> Smart Contract` hiện là target, chưa phải implemented architecture.

Production cần thêm service rõ:

- `api/` hoặc `services/api/`
- transaction builder
- storage adapter
- auth/session/wallet proof
- request validation
- indexer client/read model

## 3. Chưa có Frontend thật

Không có FE code trong repo. Production architecture phải xem FE là consumer tương lai, không phải component đã tồn tại.

Hệ quả:

- Chưa có wallet signing UX.
- Chưa có role dashboard.
- Chưa có read/write boundary ở client.

## 4. DB được gọi là off-chain state/cache nhưng chưa có indexer

`app/db/README.md` nói đúng: Mongo chỉ là app/client indexing. Nhưng chưa có code sync chain -> DB.

Rủi ro:

- API có thể ghi DB theo optimistic state rồi lệch chain.
- Demo seed có thể làm UI tưởng có task thật.
- Không có rebuild/reconciliation path.

Production rule:

- DB write cho protocol state phải đến từ Indexer sau confirmed/finalized chain read.
- API chỉ ghi intent/pending transaction riêng, không overwrite final indexed fields.

## 5. Storage và encryption chưa thành architecture thực

Whitepaper nói encrypted payload/deliverable, nhưng repo chưa có:

- storage adapter
- encryption module
- key distribution
- content hash verification
- access policy theo on-chain proof

Đây là production blocker vì task detail và deliverable là tài sản thật của marketplace.

## 6. Judge selection đang demo-grade

`submit_and_assign` dùng `RandomnessMode::BlockhashMvp` và hash từ slot/task/worker/nonce. Với production, judge selection ảnh hưởng tiền nên không thể xem là randomness mạnh.

Quyết định cần chốt:

- Dùng VRF như Switchboard/pyth entropy, hoặc
- Dùng commit-reveal, hoặc
- Chuyển judge assignment policy off-chain nhưng phải có commit/proof/slashing/appeal rõ.

## 7. Submit và assign bị coupling

Một instruction vừa submit deliverable vừa chọn judge. Điều này làm flow đơn giản nhưng boundary bị cứng:

- Không đổi được policy chọn judge mà không upgrade program.
- Không có bước moderation/eligibility off-chain.
- Assignment accounts vẫn cần init riêng sau đó.

Production có thể giữ coupling nếu mục tiêu là trustless judge assignment, nhưng phải chấp nhận program upgrade mỗi khi policy đổi.

## 8. Settlement partial vote chưa rõ authority

Hiện tại contract có thể settle sau deadline dù partial votes không đạt quorum. Nếu pass thấp hơn threshold thì task fail, nhưng không phân biệt:

- fail thật vì đủ fail votes
- fail do judge không vote
- inconclusive vì thiếu quorum

Production cần state/rule riêng:

- `Completed`
- `Failed`
- `ExpiredNoQuorum`
- `Disputed` hoặc `NeedsManualReview`

Hoặc contract phải reject inconclusive partial vote.

## 9. Admin hardcoded

`admin_init_protocol` ràng buộc `Admin11111111111111111111111111111111111111`. Đây không production-ready.

Production cần:

- deploy-time admin config
- multisig/timelock
- upgrade authority policy
- emergency pause nếu có

## 10. Mixed asset model chưa rõ

Contract dùng:

- SPL token cho bounty
- SOL lamports cho worker stake
- SOL lamports cho judge stake
- Metaplex Core asset cho task NFT

Production cần accounting spec rõ:

- token mint nào được phép
- stake asset có cùng mint với bounty hay native SOL
- decimal/amount normalization
- fee vault accounting
- dust/rounding policy cho judge fee

# ✅ PROPOSED ARCHITECTURE

## Production service layout

```text
apps/web
  Frontend app

services/api
  HTTP API
  transaction builder
  metadata validation
  storage orchestration
  wallet auth / SIWS

services/indexer
  Solana account/tx indexer
  reconciliation worker
  DB read model writer

services/storage
  S3/IPFS/local adapter
  encryption/key envelope helpers

programs/task_web
  Anchor program
  source of truth for escrow/stake/vote/settle

app/db or packages/db
  DB models, indexes, repositories
```

Nếu giữ repo hiện tại, nên đổi `app/db` thành shared package hoặc service module, không để nó bị hiểu nhầm là backend app.

## Source of truth rules

| Domain | Source of truth | Cache/read model |
| --- | --- | --- |
| Task lifecycle | `Task` account | `tasks.status` |
| Bounty escrow | SPL vault owned by Task PDA | indexed balance/tx |
| Worker assignment | `Task.worker` | `tasks.worker` |
| Worker stake | `WorkerEscrow` | indexed escrow status |
| Judge registry | `JudgeRegistry` + `JudgeRecord` | `judges` |
| Judge assignment | `Task.assigned_judges` + `TaskJudgeAssignment` | `judge_assignments` |
| Vote count | `Task.pass_vote_count`, `Task.fail_vote_count` | indexed counts |
| Settlement | `settle_payment` result | indexed transaction/status |
| Metadata bytes | Storage | metadata cache |
| File URI proof | `Task.*_uri` | cached URI |
| Transaction history | Chain | `transactions` |

## Command/query split

Command path:

```text
Frontend -> Backend API -> unsigned/partially signed transaction -> Wallet sign -> Solana -> Program
```

Query path:

```text
Solana -> Indexer -> DB -> Backend API -> Frontend
```

Backend may also read Solana RPC directly for preflight and reconciliation, but frontend-facing listing should come from indexed DB for performance.

## Backend API endpoints

Minimum production API:

- `POST /tasks/draft`: validate metadata, upload encrypted detail, return create transaction.
- `GET /tasks`: list indexed tasks.
- `GET /tasks/:taskPda`: return indexed task plus optional fresh chain check.
- `POST /tasks/:taskPda/stake/draft`: return `stake_to_unlock` transaction.
- `POST /tasks/:taskPda/submission/draft`: upload encrypted submission, return `submit_and_assign` transaction.
- `POST /tasks/:taskPda/judge-assignments/init/draft`: create missing assignment account transactions.
- `POST /tasks/:taskPda/vote/draft`: return `judge_vote` transaction.
- `POST /tasks/:taskPda/settle/draft`: return `settle_payment` transaction.
- `POST /tasks/:taskPda/judge-fee/claim/draft`: return `claim_judge_fee` transaction.
- `GET /judges/:wallet/assignments`: list indexed assignments.
- `POST /storage/upload-url`: controlled upload path.

API returns `pendingTxId`/signature tracking, but final state is only updated by indexer.

## Indexer design

Indexer writes only derived protocol state:

- Fetch all `Task` accounts by program id.
- Fetch all `TaskJudgeAssignment`.
- Fetch all `JudgeRecord`.
- Decode account data using Anchor IDL.
- Track transaction signatures for each instruction.
- Upsert DB idempotently by PDA/signature.
- Reconcile vault balances against expected bounty/fee state.

Commitment policy:

- UI can show `confirmed` as pending/fresh.
- Final accounting should use `finalized`.

Recovery:

- Rebuild all DB collections from chain.
- Re-run transaction history from deployment slot.
- Never require demo seed for production state.

## Storage and encryption design

Storage object categories:

- `task/public/{taskId}`: public metadata JSON.
- `task/private/{taskId}`: encrypted task detail.
- `submission/{taskId}/{worker}`: encrypted deliverable.
- `vote/{taskId}/{judge}` optional: encrypted/public vote note or rubric evidence.

Required metadata:

- `contentHash`
- `encryptionScheme`
- `recipients`
- `createdBy`
- `createdAt`
- `storageProvider`

Contract stores URI only. Backend/Indexer may cache hash and metadata, but verification should compare URI/hash when available.

# 🔥 CRITICAL DECISIONS

## 1. Settle ở đâu?

Decision: **Settle phải ở Smart Contract.**

Backend/API/keeper chỉ trigger `settle_payment`. Program quyết định:

- task approved hay failed
- bounty đi đâu
- stake release hay slash
- judge fee reserve bao nhiêu
- final status là gì

Lý do gắn với code: `settle_payment.rs` đã transfer SPL token từ `escrow_token_vault`, close `WorkerEscrow`, set `Task.status`, và set judge fee fields. Đây là authority thật.

## 2. Vote ở đâu?

Decision: **Vote proof và vote count ở Smart Contract.**

Judge có thể submit metadata/reason off-chain, nhưng `judge_vote` phải là final vote proof. DB chỉ index `hasVoted`, `vote`, `votedAt`.

## 3. Judge selection ở đâu?

Decision production đề xuất: **Chọn judge on-chain hoặc commit on-chain, không chọn âm thầm trong backend.**

Hiện code chọn judge trong `submit_and_assign`, nhưng randomness là `BlockhashMvp`. Production cần nâng cấp randomness trước khi mainnet:

- Preferred: VRF/entropy provider.
- Acceptable v1: commit-reveal với delay.
- Không acceptable: backend chọn judge rồi DB ghi nhận, vì judge assignment ảnh hưởng tiền.

## 4. Cache có được ghi trực tiếp từ API không?

Decision: **Không ghi final protocol state trực tiếp từ API.**

API chỉ ghi:

- request intent
- upload metadata
- pending transaction
- user/session/audit logs

Indexer ghi:

- `tasks.status`
- vote counts
- worker
- assigned judges
- settlement result
- claim status

## 5. Source of truth của metadata là gì?

Decision: **Storage giữ bytes, chain giữ URI proof, DB giữ indexed projection.**

Nếu Storage có object nhưng chain không có URI, object chưa thuộc task. Nếu DB có URI nhưng chain khác URI, chain thắng.

## 6. Backend có được ký transaction không?

Decision: **User-owned action phải do wallet ký.**

Backend chỉ có thể ký:

- keeper settle/cancel/init assignment nếu permissionless
- admin ops qua multisig/service policy
- storage service attestations nếu có thiết kế riêng

Requestor, Worker, Judge actions phải do chính wallet role ký.

## 7. DB cuối nên Mongo hay Postgres?

Decision đề xuất: **Postgres cho production, Mongo có thể giữ cho demo/cache v1.**

Lý do:

- Task/assignment/transaction có quan hệ rõ.
- Cần unique constraints, reconciliation, reporting, audit queries.
- Indexer cần idempotent upsert và transaction boundaries mạnh.

Nếu vẫn dùng Mongo, phải giữ strict indexes như `app/db/init-db.ts` và thêm migration/versioning discipline.

## 8. Cần sửa contract ngay không?

Decision: **Không cần refactor toàn bộ ngay, nhưng production blocker phải được ghi rõ.**

Giữ contract hiện tại cho local/demo E2E. Trước production cần xử lý ít nhất:

- admin hardcoded
- randomness demo-grade
- partial vote settlement ambiguity
- create flow nhận `encrypted_submission_uri`
- assignment account initialization reliability
- asset accounting spec cho bounty/stake/judge fee

## 9. Indexer là service riêng hay nằm trong Backend API?

Decision: **Service riêng.**

API request path không nên chịu trách nhiệm rebuild chain state. Indexer cần retry, checkpoint, reconciliation, backfill và chạy liên tục. Có thể share DB package với API.

## 10. Smart Contract nên giữ bao nhiêu logic?

Decision: **Giữ logic ảnh hưởng tiền và trust; đẩy logic sản phẩm mềm ra backend.**

Giữ on-chain:

- escrow
- stake
- lifecycle status tối thiểu
- submit URI proof
- assigned judge proof
- vote proof
- settlement
- claim fee

Đẩy off-chain:

- search/ranking
- rich scoring
- notification
- reputation read model
- profile
- advanced task metadata
- storage/key policy orchestration
- analytics

Ranh giới này khớp với code hiện tại: `Task` account đã đủ làm state machine tối thiểu; DB model trong `app/db/models.ts` đã phản ánh read model thay vì authority.
