# Tóm tắt

## Phạm vi

Tài liệu này tóm tắt công việc triển khai đã thực hiện theo `final_execution_plan.md`.

Lưu ý quan trọng: Kế hoạch ba giai đoạn đầy đủ bao gồm các dịch vụ sản xuất, các bộ dữ liệu kiểm thử local-validator cho luồng tiền, VRF hoặc commit-reveal randomness, thay thế quản trị, các công việc keeper, và tích hợp frontend. Những hạng mục này cần thiết lập môi trường bổ sung và các quyết định về sản phẩm/bảo mật. Đợt triển khai này chỉ thực hiện các công việc về an toàn hợp đồng và ranh giới quyền truy cập DB có thể hoàn thành an toàn trong codebase hiện tại mà không cần phát minh các lựa chọn sản xuất còn thiếu.

## Giai đoạn 1: Ngăn chặn luồng tiền và trạng thái sai

### Đã hoàn thành

- Vá các quy tắc quyết định của `settle_payment`.
  - Chỉ chấp thuận khi `pass_vote_count >= approval_threshold_n`.
  - Chỉ thất bại khi `fail_vote_count > required_judges_m - approval_threshold_n`.
  - Các phiếu bầu không quyết định sau hạn chót sẽ trả về lỗi `SettlementNotDecisive`.

- Thêm kiểm thử hồi quy cho việc quyết toán.
  - Bao gồm trường hợp `required_judges_m = 3`, `approval_threshold_n = 2`, và `1 fail` sau hạn chót.
  - Xác minh rằng trường hợp này là không quyết định, không phải thất bại.

- Thêm ràng buộc tài khoản token cho luồng tiền.
  - `initialize_task`: tài khoản token của người tạo phải thuộc về người tạo và khớp với mint đã chọn.
  - `settle_payment`: vault, tài khoản token của worker và requestor phải khớp với mint/authority của task.
  - `cancel_open_task`: hoàn tiền phải sử dụng vault của task và tài khoản token của requestor với mint của task.
  - `cancel_expired_task`: hoàn tiền phải sử dụng vault của task và tài khoản token của requestor với mint của task.
  - `claim_judge_fee`: nhận phí judge phải sử dụng vault của task và tài khoản token của judge với mint của task.

- Thêm các trường hợp lỗi chung.
  - `SettlementNotDecisive`
  - `InvalidTokenAccount`

- Khóa ranh giới quyền truy cập DB.
  - Thêm `ChainTaskSnapshot`.
  - Thêm `upsertTaskFromChain(snapshot)`.
  - Vô hiệu hóa `upsertTask()` cho trạng thái protocol.
  - Vô hiệu hóa `updateTaskStatus()` để trạng thái protocol cuối cùng không thể bị thay đổi trực tiếp bởi mã API.
  - Snapshot task giờ mang theo `slot`, `signature`, `commitment`, `programId`, và `decodedAccount`.

- Cập nhật dữ liệu mẫu demo DB sử dụng dạng snapshot chain đã được index.
  - Dữ liệu demo được đánh dấu chỉ dùng cho demo và không được phép xác thực nội dung riêng tư hoặc trạng thái protocol.

### Còn chờ

- Các kiểm thử luồng tiền P0 thực thi đầy đủ vẫn còn chờ vì repo hiện tại chưa có sẵn các bộ dữ liệu local-validator cho:
  - admin keypair hardcoded,
  - thiết lập SPL mint/token account,
  - triển khai fixture/program Metaplex Core,
  - fixture vòng đời multi-judge.

## Giai đoạn 2: Dịch vụ end-to-end tối thiểu

### Đã hoàn thành

- Mô hình DB giờ hỗ trợ snapshot task đã được index và tách biệt ý định giao dịch.
- Lớp repository giờ đảm bảo trạng thái task cuối cùng lấy từ snapshot chain đã được index.
- Bộ kiểm thử hiện tại bao gồm kiểm thử hồi quy ở cấp độ source cho ranh giới này.

### Còn chờ

- `services/indexer` chưa được triển khai.
- `services/storage` chưa được triển khai.
- `services/api` chưa được triển khai.
- Các công việc keeper chưa được triển khai.
- Các lệnh đối soát và rebuild chưa được triển khai.

Lý do: các dịch vụ này chưa tồn tại trong cấu trúc repo hiện tại, và việc triển khai hoàn chỉnh cần các lựa chọn runtime cụ thể cho HTTP server, job runner, cấu hình RPC, backend lưu trữ, định dạng auth/SIWS, và chính sách checkpoint/deployment slot.

## Giai đoạn 3: Gia cố cho sản xuất

### Đã xác định

- `RandomnessMode::BlockhashMvp` vẫn còn tồn tại và được cấu hình mặc định trong `admin_init_protocol`.
- Admin vẫn được hardcode là `Admin11111111111111111111111111111111111111`.

### Còn chờ

- Thay thế `BlockhashMvp` bằng VRF hoặc commit-reveal.
- Thay thế admin hardcoded bằng cấu hình lúc deploy hoặc authority tương thích multisig.
- Thêm quyền nâng cấp, chính sách khẩn cấp, giám sát, và các quyết định kế toán cho sản xuất.

Lý do: đây là các quyết định về sản xuất/bảo mật không nên tự ý đoán trong code. Cần có lựa chọn rõ ràng trước khi triển khai.

## Các file đã thay đổi

- `programs/task_web/src/errors.rs`
- `programs/task_web/src/instructions/initialize_task.rs`
- `programs/task_web/src/instructions/settle_payment.rs`
- `programs/task_web/src/instructions/cancel_open_task.rs`
- `programs/task_web/src/instructions/cancel_expired_task.rs`
- `programs/task_web/src/instructions/claim_judge_fee.rs`
- `app/db/models.ts`
- `app/db/repositories.ts`
- `app/db/demo-seed.ts`
- `app/db/init-db.ts`
- `app/db/README.md`
- `tests/task_web.ts`

## Xác minh

Đã vượt qua:

```bash
cargo check
/mnt/e/node.exe ./node_modules/ts-mocha/bin/ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

Kết quả:

```text
13 passing
6 pending
```

Bị chặn:

```bash
/mnt/e/node.exe ./node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

Lý do:

```text
Cannot find module 'mongodb' or its corresponding type declarations.
```

`mongodb` đã được khai báo trong `package.json`, nhưng hiện chưa có trong `node_modules`. Việc chạy `npm install` của Windows trên đường dẫn WSL UNC bị lỗi với các entry `.bin` kiểu Linux, nên cần cài đặt dependencies trong môi trường Node/Yarn Linux chuẩn hoặc dùng trình quản lý gói xử lý đúng symlink của WSL.

## Nhiệm vụ tiếp theo đề xuất

1. Thiết lập môi trường Node/Yarn Linux chuẩn trong WSL và khôi phục dependencies.
2. Thêm các fixture local-validator cho admin, SPL mint/token account, judges, và Metaplex Core.
3. Chuyển các kiểm thử vòng đời P0 còn chờ thành kiểm thử thực thi được.
4. Triển khai `services/indexer` sử dụng `upsertTaskFromChain(snapshot)`.
5. Triển khai `services/storage` với kiểm tra truy cập dựa trên proof.
6. Triển khai endpoint nháp giao dịch cho `services/api` chỉ sau khi indexer/storage đã ổn định.
7. Thay thế mô hình randomness/admin dev trước khi triển khai sản xuất.
