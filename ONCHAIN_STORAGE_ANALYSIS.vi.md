# Phan tich Luu tru On-chain va Huong Web3/Hybrid

## 1. Trang thai hien tai

Source code hien tai **da dua core protocol len on-chain**. Smart contract Anchor quan ly:

- task lifecycle;
- bounty escrow SPL token;
- worker stake escrow SOL;
- judge stake registry;
- judge assignment;
- vote count;
- settlement;
- judge fee claim;
- cancel/refund/slash logic.

Off-chain layer gom MongoDB, API skeleton, indexer skeleton va storage skeleton. Cac layer nay nen duoc xem la cache/UX layer, khong phai noi quyet dinh state protocol.

## 2. Du lieu/logic bat buoc hoac nen on-chain

### Bat buoc on-chain

| Du lieu/logic | Ly do |
|---|---|
| Task PDA va status | La state machine quyet dinh ai duoc lam gi tiep theo. |
| Requestor, worker | Can de enforce authorization va payout. |
| Token mint, escrow token vault | Can de bao dam bounty that su bi khoa. |
| Bounty amount | La co so settlement minh bach. |
| Worker stake amount va WorkerEscrow | Can de enforce stake, release, slash. |
| JudgeRecord, JudgeRegistry | Can de biet judge hop le va stake bi lock. |
| Assigned judges | Can minh bach ai duoc quyen vote. |
| Vote count, assignment vote state | Can chong sua ket qua off-chain. |
| Settlement rule | Phai deterministic va permissionless. |
| Judge fee reserve/claim state | Can chong claim trung va dam bao chia fee dung. |
| Deadline | Can enforce submit/vote/cancel bang clock on-chain. |
| PDA seeds/bump | Can verify account authority. |

### Nen on-chain

| Du lieu/logic | Ly do |
|---|---|
| Hash/checksum cua metadata/submission | Chung minh off-chain content khong bi sua, nhung khong ton gas nhu luu full content. |
| Version/schema id cua task metadata | Giup client/indexer decode dung version. |
| Randomness commitment/VRF result | Neu nang cap tu `BlockhashMvp`, nen luu commitment/result de audit. |
| Dispute/appeal state neu co | Anh huong tien va ket qua, nen khong de off-chain quyet dinh. |
| Protocol fee receiver/config co governance | Neu thay doi duoc fee/admin, nen co governance/multisig/timelock on-chain. |

## 3. Du lieu/logic khong nen on-chain

| Du lieu/logic | Ly do |
|---|---|
| Noi dung task chi tiet | Co the dai, nhay cam, ton gas/rent, public vinh vien. |
| Submission full content | Thuong la file/text lon, can private cho requestor/judge. |
| File attachment/media | Nen de IPFS/Arweave/S3/local immutable storage, on-chain chi luu URI/hash. |
| Chat/comment/message | Du lieu cao tan suat, nhieu PII, khong nen public mac dinh. |
| Search/filter/sort/list task | Nen dung indexer/DB vi query on-chain rat han che. |
| Transaction intent truoc khi ky | La UX/session state, nen off-chain. |
| Access token/session/web login | Privacy/security, khong nen on-chain. |
| Analytics/log UI | Khong lien quan consensus. |
| Encrypted payload ciphertext lon | Van ton storage va public vinh vien; nen luu off-chain, on-chain luu URI + hash. |

## 4. Kien truc hybrid de xuat

### Lop on-chain

Giu Anchor program lam source of truth:

- `Task`: store state ngan gon, amounts, deadlines, URI/hash, status.
- `WorkerEscrow`: SOL stake metadata.
- `JudgeRegistry/JudgeRecord`: judge pool va stake lock.
- `TaskJudgeAssignment`: per-judge vote/fee claim.

Bo sung nen lam:

1. **Content integrity**
   - Them `public_metadata_hash: [u8; 32]`.
   - Them `encrypted_task_detail_hash: [u8; 32]`.
   - Them `encrypted_submission_hash: [u8; 32]`.
   - URI van la `ipfs://`, `ar://`, hoac `local://`, nhung client phai verify hash.

2. **Randomness**
   - Thay `BlockhashMvp` bang VRF hoac commit-reveal.
   - Neu dung Switchboard VRF: them account VRF request/result va instruction `request_randomness`, `fulfill_assignment`.
   - Neu commit-reveal: judges/worker/requestor commit seed truoc, reveal sau, hash ket hop de chon judge.

3. **Governance/admin**
   - Bo hard-code admin khoi instruction init.
   - Luu admin/multisig trong `SystemConfig`.
   - Them instruction `update_config` co timelock/multisig.

4. **Judge slashing**
   - Hien worker co slash khi bo viec; judge stake chi lock/unregister.
   - Neu can chat luong judge, them slashing/penalty cho judge khong vote hoac vote gian lan, nhung can design appeal de tranh unfair.

### Lop indexer

Indexer nen:

- Subscribe program accounts theo `programId`.
- Decode `Task`, `JudgeRecord`, `TaskJudgeAssignment`.
- Upsert Mongo qua `upsertTaskFromChain`.
- Luu checkpoint theo slot/commitment.
- Chi coi `finalized` la final cho cac flow tai chinh neu san pham yeu cau cao.

Read model Mongo:

- `tasks`: list/filter/status/search.
- `judges`: reputation, active judge display.
- `judge_assignments`: dashboard judge.
- `transactions`: audit UI.

Nguyen tac: Mongo co the stale, nhung khong duoc authorize payout/status. Moi write protocol phai di qua smart contract.

### Lop storage

Nen dung pattern:

```text
Client encrypts payload -> storage.put -> returns URI + checksum
Client sends URI + checksum to smart contract
Indexer caches URI/checksum
Storage.get requires chain proof + role check
Client verifies checksum after download
```

Storage backend co the la:

- IPFS/Filecoin cho public immutable metadata.
- Arweave cho permanent public artifacts.
- S3/R2/local encrypted object store cho private payload.
- Lit Protocol/Threshold encryption neu muon decentralized access control.

### Lop API

API khong nen ky thay user neu khong phai custodial. De xuat:

- API tao unsigned transaction/intention.
- Wallet user ky client-side.
- API/indexer theo doi signature va cap nhat read model.

Endpoint goi y:

```text
POST /auth/wallet/nonce
POST /auth/wallet/verify
POST /tx-intents/initialize-task
POST /tx-intents/stake-to-unlock
POST /tx-intents/submit-and-assign
POST /tx-intents/judge-vote
POST /tx-intents/settle
GET  /tasks
GET  /tasks/:taskPda
GET  /judges/:wallet/assignments
POST /storage/objects
GET  /storage/objects/:uri
```

## 5. State management de xuat

### On-chain status

Giu enum hien tai:

```text
Open
InProgress
Resolving
Completed
Failed
Cancelled
Inconclusive
```

Nen them cac invariant ro:

- `Open`: `worker == default`, no votes, no fees.
- `InProgress`: worker set, worker escrow active, submission empty.
- `Resolving`: submission set, assigned judges complete.
- `Completed/Failed`: settlement done, judge fees claimable.
- `Inconclusive`: bounty refund done, judge fee usually 0.
- `Cancelled`: no further payout except state close/cleanup neu co.

### Off-chain state

API/UI chi hien thi state tu indexer:

- optimistic status co the hien thi rieng la `pending_transaction`;
- khong ghi de `status` protocol trong Mongo tu API;
- stale guard bang `lastIndexedSlot`.

## 6. Thay doi ky thuat cu the neu tiep tuc Web3 hoa

1. **Sua smart contract**
   - Them hash fields cho URI.
   - Tach random assignment thanh hai buoc neu dung VRF.
   - Them governance config.
   - Them close account/cleanup policy de giam rent bi khoa.

2. **Sua scripts**
   - Bo sung tao SPL mint/token account local helper.
   - Them E2E full tu mint -> create -> stake -> submit -> assignment -> vote -> settle -> claim.
   - Cho phep chon wallet/keypair theo role thay vi mac dinh `anchor.Wallet.local()`.

3. **Sua services**
   - Bien `services/api` thanh HTTP server that.
   - Implement wallet signature verification.
   - Implement transaction builder tra serialized transaction.
   - Implement indexer subscriber thuc su.
   - Implement storage role check dua tren decoded on-chain account.

4. **Sua DB**
   - Them collection `index_checkpoints`.
   - Them unique index theo `(programId, slot, signature)` neu can audit.
   - Luu content checksum va encryption metadata.

5. **Security**
   - Dung multisig cho admin.
   - Thay randomness MVP bang VRF/commit-reveal.
   - Them fuzz/property tests cho settlement invariants.
   - Test account substitution attack voi token vault/NFT/assignment remaining accounts.

## 7. Ket luan

Du an hien tai da co nen tang Web3 kha ro: tien, stake, vote va settlement deu nam on-chain. Phan nen uu tien tiep theo khong phai "dua tat ca len chain", ma la:

- lam on-chain state nho, audit duoc, deterministic;
- luu noi dung lon/nhay cam off-chain voi hash proof;
- bo sung indexer/API/storage de UX tot hon;
- nang cap randomness va governance de san sang production.
