# Business Rules

Backend là nơi cuối cùng thực thi mọi quy tắc (BR-12 trong đặc tả). Frontend chỉ validate để phản hồi nhanh.

Cột **Thực thi** chỉ nơi quy tắc được cài đặt: `D` = Domain, `A` = Application (validator/service), `DB` = ràng buộc cơ sở dữ liệu (lớp bảo vệ thứ hai), `API` = tầng API.

## Task

| ID | Quy tắc | Thực thi | Kiểm chứng |
|---|---|---|---|
| BR-01 | Mỗi công việc thuộc đúng một User; `UserId` do server gán từ JWT | D, A, DB (FK, NOT NULL) | Unit: tạo task; Integration: client không ghi đè được UserId |
| BR-02 | Tiêu đề bắt buộc, sau khi trim còn 1–200 ký tự | D, A | Unit: rỗng, toàn khoảng trắng, 200 và 201 ký tự |
| BR-03 | Mô tả không bắt buộc, tối đa 5000 ký tự | A | Unit |
| BR-04 | Trạng thái mặc định khi tạo: Todo (nếu client không gửi) | D | Unit |
| BR-05 | Mức ưu tiên mặc định: Medium | D | Unit |
| BR-06 | Nếu có cả StartDate và DueDate thì StartDate ≤ DueDate (bằng nhau là hợp lệ) | D, A, DB (CHECK) | Unit: biên bằng nhau, lệch 1 giây, một trong hai null |
| BR-07 | Status ∈ {Todo, InProgress, Completed}, Priority ∈ {Low, Medium, High}; giá trị lạ bị từ chối | A, DB (CHECK) | Unit + Integration (400) |
| BR-08 | Đổi trạng thái giữa hai trạng thái bất kỳ đều hợp lệ, kể cả mở lại việc Completed | D | Unit |
| BR-09 | Quá hạn: `DueDate < now (UTC)` và `Status ≠ Completed`. Task không có DueDate không bao giờ quá hạn. Task có DueDate đúng bằng `now` chưa quá hạn | D (thuộc tính), A (truy vấn) | Unit: biên; Integration: bộ lọc `overdue` khớp |
| BR-10 | Mọi thao tác đọc, sửa, xóa task chỉ áp dụng cho task của User hiện tại; task người khác bị coi như không tồn tại (404) | A | Integration: user B gọi GET, PUT, PATCH, DELETE trên task của A đều 404 và dữ liệu A không đổi |
| BR-11 | Số liệu Dashboard chỉ tính trên task của User hiện tại | A | Integration: hai user có dữ liệu khác nhau |
| BR-12 | `CreatedAt` đặt khi tạo, không đổi; `UpdatedAt` cập nhật mỗi lần sửa hoặc đổi trạng thái (UTC) | D | Unit |
| BR-13 | Thời lượng `DurationMinutes` tùy chọn, số nguyên 1..1440 phút (null = chưa đặt). Khối giờ = `StartDate` (có giờ) + thời lượng. Khối phải kết thúc trong cùng ngày địa phương (tới 24:00): quy tắc này do **Frontend** kiểm vì Backend không biết múi giờ người dùng | D, A, DB (CHECK), UI | Unit: 0, 1, 1440, 1441; Integration: 400 và lưu/đọc lại |

## Dashboard

| ID | Quy tắc | Thực thi |
|---|---|---|
| DS-01 | `total = todo + inProgress + completed` | A |
| DS-02 | `overdue` là tập con của (Todo ∪ InProgress), có thể trùng với `todo`/`inProgress`; không cộng vào total | A |
| DS-03 | Sắp đến hạn: `Status ≠ Completed`, `now ≤ DueDate ≤ now + N ngày` (mặc định N=7), sắp xếp DueDate tăng dần, mặc định 5 mục | A |
| DS-04 | Mới cập nhật: sắp xếp `UpdatedAt` giảm dần, mặc định 5 mục (kể cả Completed) | A |
| DS-05 | Dùng một thời điểm `now` duy nhất cho mỗi request để các số liệu không mâu thuẫn nhau | A |

## Account

| ID | Quy tắc | Thực thi |
|---|---|---|
| AC-01 | Email hợp lệ, tối đa 255 ký tự, chuẩn hóa về chữ thường và bỏ khoảng trắng đầu cuối trước khi lưu và so sánh; duy nhất | A, DB (unique index) |
| AC-02 | Họ tên bắt buộc, trim, 1–150 ký tự | A |
| AC-03 | Mật khẩu: ≥ 8 ký tự, ≤ 128, có ít nhất một chữ hoa, một chữ thường, một chữ số | A |
| AC-04 | Mật khẩu chỉ lưu dạng hash (PBKDF2 qua `PasswordHasher<T>`); không bao giờ xuất hiện trong response hoặc log | A, API |
| AC-05 | Đổi mật khẩu cần mật khẩu hiện tại đúng; mật khẩu mới phải khác mật khẩu cũ | A |
| AC-06 | Đổi email cần mật khẩu hiện tại đúng và email mới chưa bị dùng | A |
| AC-07 | Đăng nhập thất bại luôn trả cùng một thông báo, không phân biệt sai email hay sai mật khẩu | A |
| AC-08 | Xóa User (nếu có trong tương lai) kéo theo xóa toàn bộ task của User | DB (`ON DELETE CASCADE`) |

## Tìm kiếm và lọc

| ID | Quy tắc |
|---|---|
| SF-01 | Tìm theo tiêu đề: chứa chuỗi con, không phân biệt hoa thường (cài đặt bằng `lower()` + `strpos`, nên `% _ \` là ký tự thường và không cần escape). Chữ có dấu tiếng Việt được so khớp đúng (đã kiểm chứng đ/Đ, ế...). Hành vi `lower()` phụ thuộc collation của cơ sở dữ liệu; môi trường mới cần chạy integration test để xác nhận |
| SF-02 | Các bộ lọc kết hợp bằng AND |
| SF-03 | `dueFrom > dueTo` là lỗi 400. Task không có DueDate không khớp bất kỳ bộ lọc hạn nào |
| SF-04 | `1 ≤ page ≤ 100000`, `1 ≤ pageSize ≤ 50` (mặc định 10; chặn trên của page để phép `Skip` không tràn số); page vượt tổng trả danh sách rỗng kèm `totalCount` đúng, không lỗi |
| SF-05 | Sắp xếp: `createdAt`, `dueDate`, `priority`, chiều `asc` hoặc `desc`. DueDate null luôn xếp cuối ở cả hai chiều. Luôn thêm `Id` làm khóa phụ để thứ tự ổn định giữa các trang |
| SF-06 | `overdue=true` áp dụng BR-09; kết hợp với `status=Completed` cho kết quả rỗng (hợp lệ) |
