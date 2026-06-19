# TÀI LIỆU PHÂN TÍCH TOÀN DIỆN: VÒNG ĐỜI NHIEM VỤ (TASK LIFECYCLE) TRÊN HỆ THỐNG NDL

Tài liệu này mô tả chi tiết vòng đời của một nhiệm vụ (Task/Bounty) trên giao thức phi tập trung NDL (mạng Solana Devnet), phân tích sâu sắc theo từng thời điểm hoạt động của 3 vai trò cốt lõi: **Requestor (Người tạo)**, **Worker (Người làm)**, và **Judge (Giám khảo)**.

---

## 📊 BẢNG TỔNG HỢP TRẠNG THÁI VÀ INSTRUCTION ON-CHAIN

| STT | Tên Instruction | Vai trò kích hoạt | Trạng thái đầu vào | Trạng thái đầu ra | Mô tả dòng tiền / Tài sản |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `admin_init_protocol` | Admin | Chưa khởi tạo | Hệ thống sẵn sàng | Cấp phát tài khoản cấu hình hệ thống (`system_config`). |
| 2 | `judge_register` | Judge | Chưa đăng ký | Giám khảo sẵn sàng | Khóa SOL đặt cọc của Giám khảo vào `judge_stake_vault`. |
| 3 | `initialize_task` | Requestor | Hệ thống sẵn sàng | `Open` | Khóa Token thưởng (bounty) từ ví Creator vào `escrow_token_vault`. Tạo Core NFT. |
| 4 | `cancel_open_task` | Requestor | `Open` | `Cancelled` | Hoàn trả 100% Token thưởng từ Vault về lại ví Requestor. Trả lại NFT. |
| 5 | `stake_to_unlock` | Worker | `Open` | `InProgress` | Khóa SOL đặt cọc của Worker (`worker_stake_amount`) vào `WorkerEscrow` PDA. |
| 6 | `cancel_expired_task` | Requestor | Quá hạn `InProgress` | `Cancelled` | Hoàn trả tiền thưởng về Requestor. Phạt tịch thu (Slash) tiền cọc SOL của Worker về Requestor. |
| 7 | `submit_and_assign` | Worker | `InProgress` | `Resolving` | Worker nộp liên kết bài làm đã mã hóa. Hệ thống tự động chọn ngẫu nhiên Giám khảo dựa trên on-chain hash. |
| 8 | `init_judge_assignment`| Payer / Relayer | `Resolving` | Đã phân công | Khởi tạo tài khoản PDA phân công công việc cụ thể cho từng Giám khảo. |
| 9 | `judge_vote` | Judge | `Resolving` | Đang biểu quyết | Ghi nhận phiếu bầu (Pass/Fail) của Giám khảo on-chain. Cập nhật bộ đếm phiếu. |
| 10 | `settle_payment` | Payer / Relayer | `Resolving` (Đủ phiếu) | `Completed` / `Failed` | Mở két quyết toán: Gửi thưởng cho Worker (nếu Pass) hoặc hoàn tiền cho Requestor (nếu Fail). |
| 11 | `claim_judge_fee` | Judge | `Completed` / `Failed` | Đã nhận phí | Trích tiền phí từ `escrow_token_vault` trả cho các Giám khảo bỏ phiếu theo phe thắng cuộc. |
| 12 | `judge_unregister` | Judge | Giám khảo sẵn sàng | Đã hủy đăng ký | Hoàn trả lại SOL đặt cọc từ vault về ví Giám khảo sau khi hết thời gian khóa. |

---

## 🔄 CÁC GIAI ĐOẠN CHI TIẾT TRONG VÒNG ĐỜI TASK

### GIAI ĐOẠN 0: KHỞI TẠO NỀN TẢNG & ĐĂNG KÝ GIÁM KHẢO (PRE-REQUISITES)
Trước khi bất kỳ nhiệm vụ nào được tạo ra, nền tảng cần được thiết lập cấu hình và xây dựng ban bồi thẩm giám khảo.
* **Admin/Protocol Operator:** Kích hoạt instruction `admin_init_protocol` để thiết lập tham số nền tảng, tạo tài khoản cấu hình trung tâm `system_config` và thiết lập biểu phí hội đồng trọng tài (`judge_fee_bps`).
* **Judge (Giám khảo):** Người dùng muốn tham gia chấm bài để kiếm thu nhập thụ động phải gọi hàm `judge_register(stake_amount)`. Họ bắt buộc phải ký duyệt giao dịch để chuyển một lượng SOL cọc vào quỹ chung `judge_stake_vault`, giúp tạo lập `JudgeRecord` cá nhân và ghi danh vào `JudgeRegistry`.
* **Requestor & Worker:** Thời điểm này chỉ cần cài đặt sẵn ví và chuẩn bị các tài khoản token phù hợp (như ví dụ ví chứa đồng USDC test).

### GIAI ĐOẠN 1: ĐĂNG TẢI NHIỆM VỤ (TASK CREATION)
* **Requestor (Người tạo):** * Điền thông tin yêu cầu của Task lên giao diện (Wizard form từ bước 1 đến bước 4).
    * Bấm nút **Find ATA** để sinh ra địa chỉ tài khoản Token chính xác ứng với loại tiền thưởng (ví dụ: `GW7391...jji1B`).
    * Khi bấm nút **Đăng task**, giao dịch gọi instruction `initialize_task` được chuyển tới ví Phantom. Lúc này, toàn bộ số tiền thưởng (`bounty_amount`) tính theo đơn vị nhỏ nhất (Base Units) sẽ bị trừ khỏi ví Requestor và khóa vào ví an toàn của hợp đồng (`escrow_token_vault`).
    * Trạng thái của Task account trên chuỗi lúc này chính thức thiết lập là `Open`. Đồng thời, một Metaplex Core NFT đại diện cho quyền sở hữu task được đúc tự động, thuộc quyền kiểm soát của Task PDA.
* **Worker & Judge:** Ở trạng thái quan sát, theo dõi danh sách Task hiển thị trên Dashboard.

> 🛠 **Nhánh rẽ ngoại lệ (Hủy Task Open):** Nếu task đang ở trạng thái `Open` và chưa có bất kỳ Worker nào nhận việc, Requestor có quyền kích hoạt lệnh `cancel_open_task`. Giao thức ngay lập tức mở két hoàn trả 100% token thưởng về ví của Requestor và hủy bỏ Task (Trạng thái chuyển thành `Cancelled`).

### GIAI ĐOẠN 2: NHẬN VIỆC & THỰC HIỆN (EXECUTION)
* **Worker (Người làm):**
    * Worker duyệt danh sách, tìm thấy Task phù hợp ở trạng thái `Open`.
    * Worker tiến hành bấm nhận việc thông qua nút lệnh gọi hàm `stake_to_unlock`. Hành động này bắt buộc Worker phải chuyển một lượng SOL cọc (`worker_stake_amount`) vào tài khoản tạm giữ `WorkerEscrow` PDA. Việc đặt cọc này để đảm bảo tính cam kết cao, tránh việc nhận task bừa bãi rồi bỏ dở.
    * Ngay sau khi lệnh on-chain thành công, cấu trúc lưu trữ của Task cập nhật lại biến địa chỉ người làm: `task.worker = ví_worker`, và chuyển đổi trạng thái của nhiệm vụ sang `InProgress`.
* **Requestor:** Theo dõi tiến độ, giao diện hiển thị Task đã có người nhận và chuyển sang màu trạng thái tương ứng.
* **Judge:** Ở trạng thái chờ bài nộp.

> 🛠 **Nhánh rẽ ngoại lệ (Hủy Task Quá Hạn):** Nếu đồng hồ hệ thống đã vượt quá thời hạn nộp bài (`submission_deadline`) nhưng trường liên kết bài nộp của Worker vẫn hoàn toàn rỗng (Worker bỏ cuộc hoặc trễ hạn), Requestor sẽ kích hoạt lệnh `cancel_expired_task`. Token thưởng sẽ quay về với Requestor, đồng thời toàn bộ số SOL đặt cọc của Worker trong `WorkerEscrow` sẽ bị **phạt tịch thu (Slash)** và chuyển thẳng về ví của Requestor như một khoản đền bù thiệt hại thời gian. Task chuyển sang `Cancelled`.

### GIAI ĐOẠN 3: NỘP BÀI & PHÂN CÔNG GIÁM KHẢO (SUBMISSION & ROUTING)
* **Worker (Người làm):**
    * Sau khi hoàn thành công việc, Worker tải tệp bàn giao lên hệ thống lưu trữ và mã hóa nó, thu được đường dẫn payload bảo mật (ví dụ: `enc://task-detail-...`).
    * Worker gọi hàm `submit_and_assign` trước khi hết hạn `submission_deadline`.
    * **Cơ chế chọn Giám khảo tự động:** Smart contract sẽ áp dụng thuật toán băm mật mã học (kết hợp các biến số: định danh task, khóa ví worker, số block slot hiện tại và số nonce) để tự động chọn ngẫu nhiên ra danh sách các vị giám khảo (`required_judges_m`) từ bể giám khảo đang hoạt động (`JudgeRegistry`). Việc này đảm bảo tính minh bạch, tuyệt đối chống gian lận hay thông đồng phe cánh.
    * Task chuyển trạng thái sang `Resolving`.
* **Payer / Relayer:** Kích hoạt instruction `init_judge_assignment` nhằm tạo lập các bản ghi thực thi `TaskJudgeAssignment` PDA riêng lẻ cho từng vị giám khảo đã được chọn ở trên.

### GIAI ĐOẠN 4: ĐÁNH GIÁ & BỎ PHIẾU (JUDGING / VOTING)
* **Judge (Giám khảo được chọn):**
    * Hệ thống gửi thông báo yêu cầu chấm bài đến các giám khảo có tên trong danh sách phân công. Giám khảo sử dụng khóa giải mã an toàn để xem chi tiết bài nộp của Worker.
    * Giám khảo thực hiện bỏ phiếu lựa chọn Đạt hoặc Không Đạt bằng cách gọi instruction `judge_vote(is_pass)`. Thời hạn biểu quyết phải nằm trước mốc `voting_deadline`.
    * Mỗi khi một vị giám khảo hoàn tất ký duyệt, hệ thống on-chain sẽ cộng dồn vào bộ đếm tương ứng: tăng `pass_vote_count` hoặc `fail_vote_count`.
* **Requestor & Worker:** Ở trạng thái chờ đợi phán quyết từ hội đồng trọng tài.

### GIAI ĐOẠN 5: NGHIỆM THU & QUYẾT TOÁN DÒNG TIỀN (SETTLEMENT & PAYOUT)
Khi số lượng phiếu bầu đã tích lũy đủ ngưỡng phê duyệt tối thiểu (`approval_threshold_n`), bất kỳ bên nào hoặc hệ thống tự động (Payer/Relayer) có thể đứng ra gửi lệnh kết thúc nhiệm vụ thông qua instruction `settle_payment`.

* **Trường hợp A: Hội đồng chấm ĐẠT (Pass Vote thắng thế)**
    * Két sắt thông minh `escrow_token_vault` được mở: Hệ thống tự động chuyển Token thưởng (`bounty_amount`) về ví nhận của Worker (`worker_token_account`). *Lưu ý: Số tiền thưởng này sẽ được trích lại một phần nhỏ làm quỹ chi trả phí cho giám khảo (`judge_fee_bps`)*.
    * Tài khoản cọc của Worker (`WorkerEscrow`) được đóng hoàn toàn, giải phóng trả lại 100% số SOL cọc ban đầu về ví cho Worker.
    * Trạng thái Task chuyển sang trạng thái cuối cùng: `Completed`.
* **Trường hợp B: Hội đồng chấm KHÔNG ĐẠT (Fail Vote thắng thế hoặc không đạt ngưỡng kết luận)**
    * Toàn bộ Token thưởng đang khóa trong `escrow_token_vault` sẽ được giải phóng và hoàn trả nguyên vẹn về ví của Requestor.
    * Tùy thuộc vào cấu hình contract, số tiền cọc của Worker có thể bị phạt một phần hoặc toàn bộ do không đáp ứng chất lượng cam kết.
    * Trạng thái Task chuyển sang trạng thái thất bại: `Failed`.
* **Hành động Claim phí của Giám khảo (Judge Payout):**
    * Sau khi trạng thái thanh toán đã xác định (`Completed` hoặc `Failed`), các vị giám khảo nào đã đưa ra lá phiếu chính xác (bỏ phiếu theo phe thắng cuộc) sẽ gọi hàm `claim_judge_fee`.
    * Smart contract trích xuất khoản phí hoa hồng trọng tài từ két quỹ thưởng chia đều và bắn thẳng về ví token cá nhân của các giám khảo đó, đồng thời đánh dấu trạng thái tài khoản là `has_claimed_fee`.

---

## 🔒 CƠ CHẾ BẢO MẬT & XÁC THỰC QUYỀN (AUTHORIZATION SANITY CHECK)

Để tránh các cuộc tấn công chiếm đoạt tài sản hoặc thay đổi dữ liệu trái phép, Smart Contract thực hiện kiểm tra nghiêm ngặt các ràng buộc sau (Constraints):
1.  **Quyền Requestor:** Đối với các hàm hủy task (`cancel_open_task`, `cancel_expired_task`), địa chỉ ví ký giao dịch bắt buộc phải trùng khớp tuyệt đối với người đã khởi tạo lưu trong cấu trúc dữ liệu: `constraint: task.requestor == requestor.key()`.
2.  **Quyền Worker:** Đối với hàm nộp bài, kiểm tra xem người nộp có đúng là người đã cọcSOL nhận việc trước đó không: `constraint: task.worker == worker.key()`.
3.  **Quyền Giám khảo:** Hàm biểu quyết `judge_vote` chỉ chấp nhận chữ ký từ đúng thực thể giám khảo nằm trong danh sách mảng được sinh ngẫu nhiên từ trước, đồng thời kiểm tra thời gian thực thi không được vượt quá `voting_deadline`.