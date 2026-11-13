# Use Cases

Tác nhân duy nhất: **User** (đã đăng nhập, trừ UC-01 và UC-02). Mọi UC từ UC-03 trở đi yêu cầu JWT hợp lệ và chỉ thao tác trên dữ liệu của chính User đó (xem [business-rules.md](business-rules.md)).

## Nhóm Authentication

### UC-01 Đăng ký
- **Tiền điều kiện:** chưa đăng nhập.
- **Luồng chính:** nhập họ tên, email, mật khẩu → hệ thống validate → tạo tài khoản (mật khẩu đã hash) → đăng nhập luôn và vào Dashboard.
- **Luồng thay thế:** email sai định dạng hoặc đã tồn tại (409) → báo lỗi tại trường email; mật khẩu không đạt chính sách → liệt kê điều kiện chưa đạt.

### UC-02 Đăng nhập
- **Luồng chính:** nhập email và mật khẩu → nhận access token → vào Dashboard.
- **Luồng thay thế:** sai email hoặc mật khẩu → 401 với thông báo chung, không tiết lộ email có tồn tại hay không.

### UC-03 Đăng xuất
- **Luồng chính:** User chọn Đăng xuất → gọi `POST /api/auth/logout` (204) → Frontend xóa token và về trang đăng nhập.
- **Ghi chú:** token JWT vẫn hợp lệ về mặt kỹ thuật đến khi hết hạn (xem quyết định #2).

### UC-04 Xem tài khoản hiện tại
- Frontend gọi `GET /api/auth/me` khi khởi động để khôi phục phiên. Token hết hạn hoặc không hợp lệ (401) → xóa token, về trang đăng nhập.

### UC-05 Đổi mật khẩu
- **Luồng chính:** nhập mật khẩu hiện tại, mật khẩu mới → thành công (204), hiển thị thông báo.
- **Luồng thay thế:** mật khẩu hiện tại sai (400, lỗi ở trường `currentPassword`); mật khẩu mới không đạt chính sách; mật khẩu mới trùng mật khẩu cũ.

## Nhóm Profile

### UC-06 Xem hồ sơ
- Hiển thị họ tên, email, ngày tạo.

### UC-07 Cập nhật hồ sơ
- **Luồng chính:** sửa họ tên và/hoặc email → lưu.
- **Quy tắc:** nếu email thay đổi thì bắt buộc nhập mật khẩu hiện tại. Email mới trùng người khác → 409.

## Nhóm Dashboard

### UC-08 Xem tổng quan
- Hiển thị: tổng số, số Todo / InProgress / Completed, số quá hạn, danh sách sắp đến hạn, danh sách mới cập nhật.
- Dữ liệu tính từ DB tại thời điểm gọi. User chưa có công việc → empty state mời tạo công việc đầu tiên.

## Nhóm Task

### UC-09 Tạo công việc
- **Luồng chính:** nhập tiêu đề (bắt buộc), mô tả, ưu tiên (mặc định Medium), trạng thái (mặc định Todo), ngày bắt đầu, hạn hoàn thành → tạo (201) → chuyển tới chi tiết hoặc quay lại danh sách.
- **Luồng thay thế:** thiếu tiêu đề; tiêu đề > 200 ký tự; ngày bắt đầu > hạn hoàn thành → 400 kèm lỗi theo trường.

### UC-10 Xem danh sách công việc
- Phân trang, sắp xếp theo ngày tạo / hạn hoàn thành / mức ưu tiên, tăng hoặc giảm dần, mặc định ngày tạo giảm dần.
- Hiển thị tiêu đề, trạng thái, ưu tiên, hạn hoàn thành, cờ quá hạn.
- Trạng thái: đang tải (skeleton), rỗng (chưa có việc hoặc không khớp bộ lọc, hai thông điệp khác nhau), lỗi (có nút thử lại).

### UC-11 Tìm kiếm và lọc
- Tìm theo tiêu đề; lọc theo trạng thái, ưu tiên, khoảng hạn hoàn thành, chỉ việc quá hạn; kết hợp được; luôn phân trang. Thực hiện ở Backend.
- Đổi bộ lọc thì quay về trang 1. Bộ lọc phản ánh trên URL để chia sẻ/refresh không mất.

### UC-12 Xem chi tiết công việc
- Hiển thị đầy đủ các trường, ngày tạo, ngày cập nhật. Task không tồn tại hoặc không thuộc User → 404 và trang "Không tìm thấy công việc".

### UC-13 Chỉnh sửa công việc
- Sửa mọi trường; áp dụng cùng validation với UC-09. Cập nhật `UpdatedAt`.

### UC-14 Đổi trạng thái nhanh
- Từ danh sách hoặc chi tiết, đổi trạng thái không cần mở form (`PATCH /api/tasks/{id}/status`). Cho phép chuyển giữa bất kỳ hai trạng thái nào (kể cả mở lại việc đã Completed).

### UC-15 Xóa công việc
- **Luồng chính:** bấm Xóa → hộp thoại xác nhận nêu tên công việc → xác nhận → 204 → thông báo "Đã xóa".
- **Luồng thay thế:** hủy hộp thoại thì không có gì thay đổi; task không thuộc User → 404.

## Ma trận truy xuất

| UC | Endpoint | Màn hình |
|---|---|---|
| 01 | POST /api/auth/register | Register |
| 02 | POST /api/auth/login | Login |
| 03 | POST /api/auth/logout | Header menu |
| 04 | GET /api/auth/me | App init |
| 05 | POST /api/auth/change-password | Profile |
| 06, 07 | GET, PUT /api/users/profile | Profile |
| 08 | GET /api/dashboard/{summary,upcoming-tasks,recent-tasks,report} | Dashboard |
| 09 | POST /api/tasks | Create Task |
| 10, 11 | GET /api/tasks | Task List |
| 12 | GET /api/tasks/{id} | Task Detail |
| 13 | PUT /api/tasks/{id} | Edit Task |
| 14 | PATCH /api/tasks/{id}/status | List, Detail |
| 15 | DELETE /api/tasks/{id} | List, Detail |
