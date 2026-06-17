# Task - Tổng hợp kiến trúc hiện tại và định hướng

## 1. Mục đích tài liệu

Tài liệu này tổng hợp trạng thái kiến trúc hiện tại của dự án Task. Nội dung chỉ mô tả hệ thống đang được thiết kế theo hướng nào, những quyết định đã được chọn, vai trò của từng thành phần và những phần vẫn đang mở/chưa chốt.

Tài liệu này không phải bản thiết kế mới, không phải review đúng sai và không phải đề xuất thay đổi.

## 2. Triết lý kiến trúc đang sử dụng

Dự án đang đi theo hướng **Hybrid Architecture**, với Backend API là trung tâm điều phối business workflow và Smart Contract là trust layer cho các phần cần bảo chứng.

Cách hiểu hiện tại:

```text
Frontend
  -> Backend API
      -> Database
      -> Storage
      -> Smart Contract
  -> Wallet sign khi cần transaction
Indexer
  -> Sync dữ liệu on-chain về Database
```

Triết lý chính:

- Backend API giữ vai trò "core brain" cho business logic mềm và flow ứng dụng.
- Smart Contract không bị loại bỏ; nó vẫn là lớp bảo chứng cho tiền, stake, vote proof và settlement.
- Database giữ off-chain state/cache để frontend và API truy vấn nhanh, dễ debug, dễ test.
- Indexer đồng bộ trạng thái từ chain về DB để giảm lệch dữ liệu.
- Storage giữ metadata, encrypted payload và deliverable vì các dữ liệu này không phù hợp để lưu trực tiếp on-chain.

## 3. Kiến trúc tổng quan hiện tại

```text
                ┌──────────────────────┐
                │      Frontend        │
                │  UI + Wallet sign    │
                └─────────┬────────────┘
                          │
                          ▼
                ┌──────────────────────┐
                │      Backend API     │
                │   Business Logic     │
                └──────┬─────┬─────────┘
                       │     │
         ┌─────────────┘     └──────────────┐
         ▼                                  ▼
┌──────────────────────┐         ┌──────────────────────┐
│   Database           │         │  Smart Contract      │
│  Postgres / Mongo    │         │  Solana Program      │
│  Off-chain state     │         │  Escrow / Money      │
└──────────────────────┘         └──────────────────────┘
         ▲                                  ▲
         │                                  │
         └───────────┬──────────────────────┘
                     ▼
            ┌──────────────────┐
            │   Indexer        │
            │ Sync chain -> DB │
            └──────────────────┘

Storage: S3/IPFS/local storage cho metadata, payload và deliverable.
```

## 4. Trạng thái code hiện tại

Repo hiện tại có các phần chính:

- Smart Contract / Solana Program: `programs/task_web`
- Anchor tests: `tests`
- MongoDB cache/off-chain data layer: `app/db`
- Docker Compose cho MongoDB: `docker-compose.mongo.yml`
- Project config Anchor: `Anchor.toml`

Smart Contract hiện tại đã có nhiều instruction quan trọng cho workflow chính:

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

State on-chain hiện tại đã có các phần:

- Task account
- Judge assignment account
- Escrow-related state
- Judge pool / judge record
- Task status
- Deadline
- Bounty amount
- Worker stake amount
- Vote count
- Metadata URI
- Encrypted task detail URI
- Encrypted submission URI

Database layer hiện tại đang đóng vai trò cache/indexing:

- `tasks`
- `judges`
- `judge_assignments`
- `transactions`

## 5. Quyết định kiến trúc đã được chọn

### 5.1 Chọn Option B - Hybrid

Dự án không đi theo hướng Web3 chuẩn hoàn toàn, tức là không để frontend tương tác trực tiếp với Smart Contract cho toàn bộ workflow.

Hướng đã chọn:

```text
Frontend -> Backend API -> Smart Contract
                  |
                  v
              Database / Storage
```

### 5.2 Backend API là trung tâm workflow

Backend API được định hướng là nơi điều phối flow ứng dụng:

- Nhận request từ frontend.
- Validate dữ liệu ở tầng ứng dụng.
- Điều phối upload metadata/payload.
- Gọi Solana program thông qua Anchor client.
- Ghi hoặc cập nhật DB cache.
- Trả response theo kiểu API backend thông thường.
- Hỗ trợ test local bằng Postman/curl/integration tests.

### 5.3 Smart Contract hiện tại được giữ nguyên ở giai đoạn này

Smart Contract hiện tại được xem là **trust core v1**.

Cách hiểu hiện tại:

- Không refactor Smart Contract ngay.
- Dùng Smart Contract hiện tại để chạy full flow end-to-end.
- Không mặc định Smart Contract hiện tại là final architecture.
- Sau khi Backend API, DB và Indexer chạy ổn, mới quan sát lại ranh giới on-chain/off-chain.

### 5.4 Smart Contract giữ các phần cần trust

Smart Contract đang giữ các logic quan trọng liên quan đến:

- Escrow/bounty.
- Worker stake.
- Task state tối thiểu.
- Submit proof/URI.
- Judge vote.
- Settlement.
- Judge fee claim.
- Cancel theo điều kiện.

### 5.5 Database là off-chain state/cache

Database không thay thế nguồn sự thật của tiền và settlement.

Database được dùng cho:

- Listing task.
- Search/filter.
- Metadata phục vụ UI.
- Cache account state.
- Transaction history.
- Judge/task assignment view.
- Debug và observability.

### 5.6 Storage dành cho dữ liệu lớn và dữ liệu mã hóa

Metadata, task payload và deliverable không được xem là dữ liệu nên lưu trực tiếp on-chain.

Storage được định hướng dùng cho:

- Public metadata.
- Encrypted task detail.
- Encrypted deliverable.
- Các file/output lớn.

Storage có thể là:

- Local storage trong giai đoạn dev/demo.
- S3.
- IPFS.

## 6. Ranh giới trách nhiệm hiện tại

### Frontend

Frontend chịu trách nhiệm:

- Hiển thị UI.
- Kết nối ví.
- Lấy dữ liệu từ Backend API.
- Kích hoạt các hành động như tạo task, stake, submit, vote, settle.
- Wallet sign khi flow yêu cầu chữ ký transaction.

Frontend không được định hướng là nơi giữ toàn bộ business workflow.

### Backend API

Backend API chịu trách nhiệm:

- Điều phối business workflow.
- Chuẩn hóa API cho frontend.
- Tạo trải nghiệm test giống backend Web2.
- Gọi Smart Contract.
- Làm việc với DB.
- Làm việc với Storage.
- Quản lý logic mềm có thể thay đổi theo sản phẩm.

### Smart Contract

Smart Contract chịu trách nhiệm:

- Bảo chứng các hành vi liên quan đến tiền và stake.
- Ghi nhận trạng thái quan trọng.
- Xử lý vote/settlement theo logic hiện tại.
- Là trust core v1 để validate concept.

### Database

Database chịu trách nhiệm:

- Lưu/cache dữ liệu phục vụ API và UI.
- Giữ off-chain state.
- Lưu dữ liệu đã index từ chain.
- Hỗ trợ debug, query và test.

### Indexer

Indexer chịu trách nhiệm:

- Đọc dữ liệu từ Solana.
- Sync account/transaction state về DB.
- Giảm rủi ro DB lệch với chain.
- Hỗ trợ rebuild cache khi cần.

### Storage

Storage chịu trách nhiệm:

- Lưu metadata.
- Lưu encrypted payload.
- Lưu encrypted deliverable.
- Trả URI để ghi vào DB hoặc Smart Contract.

## 7. Định hướng theo giai đoạn

### Phase 1 - Hiện tại

Trọng tâm:

- Không sửa Smart Contract.
- Xây Backend API bọc quanh Smart Contract hiện có.
- Dùng DB làm cache/off-chain state.
- Dùng Storage cho metadata/payload.
- Tạo flow test local giống backend API.

Mục tiêu:

- Chạy được full flow.
- Test được bằng API.
- Quan sát friction thật trong quá trình dev.

### Phase 2 - Quan sát

Trọng tâm:

- Theo dõi logic nào thay đổi nhiều.
- Theo dõi logic nào khó debug khi nằm on-chain.
- Theo dõi phần nào cần trustless thật sự.
- Theo dõi DB và chain có lệch nhau không.

Mục tiêu:

- Làm rõ ranh giới giữa Backend API và Smart Contract dựa trên usage thật.

### Phase 3 - Refactor ranh giới nếu cần

Trọng tâm:

- Chỉ refactor sau khi đã có dữ liệu thực tế từ API/demo flow.
- Logic mềm có thể chuyển về Backend API.
- Logic trust-critical giữ lại on-chain.

Mục tiêu:

- Giảm độ cứng của Smart Contract nếu cần.
- Giữ Smart Contract gọn hơn trong kiến trúc dài hạn.

## 8. Các phần đã chốt

Các quyết định đã được chọn:

- Tên dự án hiện tại là **Task**.
- Kiến trúc chọn hướng **Hybrid / Backend-centric with Smart Contract trust layer**.
- Không chọn hướng frontend tương tác trực tiếp Smart Contract cho toàn bộ workflow.
- Backend API sẽ là trung tâm điều phối workflow.
- Smart Contract hiện tại chưa refactor ngay.
- Smart Contract hiện tại được dùng như trust core v1.
- DB dùng làm off-chain state/cache.
- Indexer dùng để sync chain về DB.
- Storage dùng cho metadata/payload/deliverable.
- Local testing cần giống backend API thông thường.

## 9. Các phần còn mở/chưa chốt

Các phần chưa chốt hoặc cần được xác định sau:

- Backend API sẽ đặt trong `app` hiện tại hay tách thành thư mục/service riêng.
- Backend API dùng framework cụ thể nào.
- DB cuối cùng dùng MongoDB hay Postgres.
- Storage dùng local, S3 hay IPFS ở bản demo và bản sau demo.
- Cơ chế key management/encryption chi tiết.
- Judge selection policy nằm ở Backend API hay giữ một phần on-chain.
- Scoring nâng cao có nằm on-chain hay off-chain.
- Reputation system nằm ở DB, Smart Contract hay kết hợp cả hai.
- Indexer chạy dạng cron/job, service riêng hay tích hợp trong Backend API.
- Frontend ký transaction trực tiếp rồi gửi signature, hay Backend chuẩn bị transaction để frontend sign.
- Những phần nào của Smart Contract hiện tại sẽ được giữ lâu dài.
- Những phần nào của Smart Contract hiện tại có thể được chuyển về Backend API sau Phase 2.

## 10. Tóm tắt một câu

Dự án Task hiện đang đi theo kiến trúc **Hybrid**: Backend API là trung tâm điều phối business workflow, Smart Contract hiện tại là trust core v1 cho tiền/stake/vote/settlement, Database là off-chain state/cache, Indexer đồng bộ chain về DB và Storage giữ metadata/payload/deliverable.
