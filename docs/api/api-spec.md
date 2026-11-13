# API Specification

Base path `/api`. JSON (`application/json`), enum dạng chuỗi (số bị từ chối), thời gian ISO 8601 UTC. Server trả dạng `2026-11-12T09:30:00+00:00`; khi nhận, chấp nhận mọi offset hợp lệ (`Z`, `+07:00`...) và chuẩn hóa về UTC. Swagger UI ở `/swagger` (chỉ Development). `GET /health` công khai, trả `{"status":"ok"}`.

Ngôn ngữ: gửi `Accept-Language: vi`, `en`, `ja` hoặc `zh`; `title`, `detail` và lỗi từng trường của ProblemDetails được dịch theo (mặc định `vi`). Phản hồi lỗi có `Content-Language` và `Vary: Accept-Language`.

Xác thực: header `Authorization: Bearer <accessToken>`. Cột **Auth** = cần đăng nhập.

## Endpoint

| Method | Path | Auth | Thành công | Mô tả |
|---|---|---|---|---|
| POST | /api/auth/register | không | 201 `AuthResponse` | Đăng ký, đăng nhập luôn |
| POST | /api/auth/login | không | 200 `AuthResponse` | Đăng nhập |
| POST | /api/auth/refresh | không | 200 `AuthResponse`, 401 | Đổi refresh token lấy access token mới và refresh token mới (xoay vòng, ADR-20) |
| POST | /api/auth/logout | không | 204 | Thu hồi phiên của thiết bị theo `{ refreshToken }`; luôn 204 |
| GET | /api/auth/me | có | 200 `UserDto` | Tài khoản hiện tại |
| POST | /api/auth/change-password | có | 204 | Đổi mật khẩu; `refreshToken` (tùy chọn) của thiết bị này được giữ, mọi thiết bị khác bị đăng xuất |
| GET | /api/users/profile | có | 200 `UserDto` | Xem hồ sơ |
| PUT | /api/users/profile | có | 200 `UserDto` | Cập nhật hồ sơ |
| GET | /api/tasks | có | 200 `PagedResult<TaskDto>` | Danh sách, lọc, sắp xếp, phân trang |
| GET | /api/tasks/{id} | có | 200 `TaskDto` | Chi tiết |
| POST | /api/tasks | có | 201 `TaskDto` + `Location` | Tạo |
| PUT | /api/tasks/{id} | có | 200 `TaskDto` | Cập nhật toàn bộ |
| PATCH | /api/tasks/{id}/status | có | 200 `TaskDto` | Đổi trạng thái |
| DELETE | /api/tasks/{id} | có | 204 | Xóa |
| GET | /api/dashboard/summary | có | 200 `DashboardSummaryDto` | Số liệu tổng quan |
| GET | /api/dashboard/upcoming-tasks | có | 200 `TaskDto[]` | Sắp đến hạn |
| GET | /api/dashboard/recent-tasks | có | 200 `TaskDto[]` | Mới cập nhật |
| GET | /api/dashboard/report | có | 200 `ReportDto`, 400 | Báo cáo thời gian làm việc theo tuần/tháng/năm |

`GET /api/auth/me` và `GET /api/users/profile` trả cùng dữ liệu; `me` dùng khi khởi động phiên, `profile` cho màn hình hồ sơ. Nếu tài khoản đã bị xóa nhưng token còn hạn thì cả hai trả 401.

Đăng ký trả 201 kèm `AuthResponse` (`accessToken`, `expiresAt`, `refreshToken`, `user`; tự đăng nhập). Đăng nhập sai luôn trả cùng một thông báo ("Email hoặc mật khẩu không đúng.") dù sai email hay sai mật khẩu, và thời gian xử lý tương đương.

## DTO

```jsonc
// AuthResponse
{ "accessToken": "eyJ...", "expiresAt": "2026-11-12T10:30:00Z", "refreshToken": "base64url...", "user": UserDto }

// UserDto  (không bao giờ có passwordHash)
{ "id": "uuid", "fullName": "Nguyễn Văn A", "email": "a@example.com", "createdAt": "...", "updatedAt": "..." }

// TaskDto
{
  "id": "uuid", "title": "Viết báo cáo", "description": "…|null",
  "status": "Todo|InProgress|Completed", "priority": "Low|Medium|High",
  "startDate": "…|null", "durationMinutes": 90, "dueDate": "…|null",
  "isOverdue": false,                 // tính ở server theo BR-09
  "createdAt": "...", "updatedAt": "..."
}
// TaskDto không chứa userId: client không cần và không nên biết.

// PagedResult<T>
{ "items": [T], "page": 1, "pageSize": 10, "totalCount": 42, "totalPages": 5 }

// DashboardSummaryDto
{ "total": 12, "todo": 5, "inProgress": 3, "completed": 4, "overdue": 2 }
```

## Request body

| Endpoint | Body | Ràng buộc |
|---|---|---|
| register | `{ fullName, email, password }` | AC-01, AC-02, AC-03 |
| login | `{ email, password }` | không để trống |
| change-password | `{ currentPassword, newPassword }` | AC-03, AC-05 |
| PUT profile | `{ fullName, email, currentPassword? }` | `currentPassword` bắt buộc khi email đổi (AC-06) |
| POST tasks | `{ title, description?, priority?, status?, startDate?, durationMinutes?, dueDate? }` | BR-02..BR-07, BR-13 (`durationMinutes` 1..1440, ngoài khoảng → 400 `errors.durationMinutes`); vắng `priority`/`status` thì dùng mặc định. Ngày quá khứ được phép. Mô tả toàn khoảng trắng được lưu thành null; tiêu đề được cắt khoảng trắng đầu cuối |
| PUT tasks/{id} | `{ title, description?, priority, status, startDate?, dueDate? }` | Thay toàn bộ; `description`, `startDate`, `durationMinutes`, `dueDate` null hoặc vắng thì xóa giá trị (gửi lại `durationMinutes` nếu muốn giữ). `priority` và `status` **bắt buộc** (thiếu thì 400, không âm thầm thành Low/Todo) |
| PATCH status | `{ status }` | BR-07 |

Trường lạ trong body (ví dụ `userId`, `id`, `createdAt`) bị bỏ qua, không bao giờ được ghi.

## GET /api/tasks: query

| Param | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| search | string | | Tiêu đề chứa chuỗi (SF-01), tối đa 200 ký tự. Không phân biệt hoa thường, giữ nguyên dấu tiếng Việt ("đi" khớp "Đi chợ" nhưng "dien" không khớp "điện"). `%`, `_`, `\` là ký tự thường. Chuỗi toàn khoảng trắng = không lọc |
| status | `Todo\|InProgress\|Completed` | | |
| priority | `Low\|Medium\|High` | | |
| startFrom, startTo | ISO 8601 | | Khoảng đóng theo `StartDate` (dùng cho Lịch ngày); `startFrom ≤ startTo` |
| dueFrom, dueTo | ISO 8601 | | Khoảng đóng `[dueFrom, dueTo]`; `dueFrom ≤ dueTo` |
| overdue | bool | | `true` → chỉ task quá hạn (BR-09); `false` hoặc vắng mặt = không lọc |
| sortBy | `createdAt\|dueDate\|priority\|startDate` | `createdAt` | |
| sortDir | `asc\|desc` | `desc` | |
| page | int 1..100000 | 1 | Vượt tổng số trang thì trả `items` rỗng kèm `totalCount` đúng, không lỗi |
| pageSize | int 1..50 | 10 | |

Giá trị không hợp lệ (vd `sortBy=foo`, `pageSize=0`) → 400, không âm thầm dùng mặc định. Tên enum không phân biệt hoa thường. Lưu ý: ở query string, số hợp lệ của enum cũng được chấp nhận (`status=1` = `InProgress`) và số ngoài khoảng bị từ chối; ở request body thì chỉ nhận chuỗi. Lỗi định dạng (sai kiểu/enum lạ) được báo trước, lỗi giá trị (vd `pageSize=0`) báo ở lần gọi tiếp theo nếu cả hai cùng có.

Thứ tự ổn định: mọi kiểu sắp xếp đều có khóa phụ `Id`, nên các dòng có giá trị sắp xếp trùng nhau vẫn có thứ tự cố định giữa các trang (thứ tự `Id` theo byte của `uuid`).

## Dashboard: query

| Endpoint | Param | Mặc định | Giới hạn |
|---|---|---|---|
| upcoming-tasks | `limit`, `days` | 5, 7 | limit 1..20, days 1..90. Cửa sổ `now ≤ dueDate ≤ now + days`, đóng ở cả hai đầu, chỉ task chưa Completed; sắp xếp hạn tăng dần |
| recent-tasks | `limit` | 5 | 1..20. Sắp xếp `updatedAt` giảm dần, gồm cả task Completed |
| report | `period` | `week` | `week` \| `month` \| `year` |
| report | `date` | hôm nay (theo múi giờ của người gọi) | `yyyy-MM-dd`, một ngày bất kỳ trong kỳ cần xem |
| report | `utcOffsetMinutes` | 0 | -840..840. Frontend gửi `-getTimezoneOffset()` để ngày được tính theo đồng hồ của người dùng |

`report` trả `{ period, from, to, buckets[], totals }`. Kỳ là tuần (từ thứ Hai), tháng hoặc năm dương lịch; `buckets` là từng ngày (tuần, tháng) hoặc từng tháng (năm) với `{ start, completedTasks, minutes }`. **Giờ làm việc** = tổng `durationMinutes` của các task **Completed**, tính vào ngày `startDate`; task không có `startDate` không được tính, task không có thời lượng được đếm nhưng cộng 0 phút. `totals` có `completedTasks`, `minutes`, `elapsedDays` (số ngày của kỳ đã trôi qua), `averagePerDayMinutes` (= minutes / elapsedDays), `averagePerWeekMinutes` (= trung bình ngày x 7; null ở báo cáo tuần) và `averagePerMonthMinutes` (= trung bình ngày x 365,25/12; chỉ có ở báo cáo năm). Kỳ chưa bắt đầu có `elapsedDays` = 0 và mọi trung bình bằng 0.

## Lỗi (RFC 7807)

Mọi lỗi trả `application/problem+json`:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Dữ liệu không hợp lệ",
  "status": 400,
  "detail": "Một hoặc nhiều trường không hợp lệ.",
  "instance": "/api/tasks",
  "traceId": "00-...",
  "errors": { "title": ["Tiêu đề không được để trống."], "dueDate": ["…"] }
}
```

- `errors` chỉ có ở lỗi validation; khóa là tên trường dạng camelCase, khớp với tên trường trong body/query để Frontend gắn lỗi vào đúng ô.
- Thông điệp lỗi viết bằng tiếng Việt, dành cho người dùng cuối.
- Lỗi 500 chỉ trả thông điệp chung và `traceId`; chi tiết ngoại lệ chỉ ghi vào log.
- Lỗi định dạng dữ liệu (JSON hỏng, sai kiểu, enum không tồn tại, số thay cho enum) trả 400 với `errors.<tên trường>: ["Giá trị không hợp lệ."]`; JSON hỏng hoàn toàn thì khóa là `body`. Thông điệp của framework (tiếng Anh, lộ tên kiểu nội bộ) không bao giờ được trả ra ngoài.

| Status | Khi nào |
|---|---|
| 400 | Validation, body hỏng, tham số truy vấn sai, vi phạm business rule (BR-06...), sai `currentPassword` |
| 401 | Thiếu/sai/hết hạn token; đăng nhập sai. Cũng áp dụng cho **mọi route không tồn tại** khi chưa đăng nhập: mặc định mọi route đều yêu cầu đăng nhập nên không thể dò route |
| 404 | Task không tồn tại **hoặc không thuộc User hiện tại** (BR-10) |
| 409 | Email đã được dùng (register, đổi email) |
| 429 | Vượt giới hạn tần suất của login/register (10 yêu cầu/phút/IP, cấu hình `RateLimiting:AuthPermitPerMinute`) |
| 500 | Lỗi không lường trước |

Không dùng 403 trong v1 vì không có phân quyền theo vai trò. Không dùng 422: mọi lỗi dữ liệu là 400 để đơn giản.

## Bảo mật liên quan
- JWT chỉ chứa `sub` (UserId), `jti`, `iat`, `exp`, `iss`, `aud`. Không đưa email/họ tên vào token để tránh dữ liệu cũ sau khi đổi.
- Ký HS256 và chỉ chấp nhận HS256, khóa ≥ 32 byte từ cấu hình (thiếu hoặc ngắn thì API không khởi động); `ClockSkew` 30 giây; kiểm tra issuer, audience, hạn.
- CORS chỉ cho origin của Frontend (cấu hình qua env), không `*`.
- Rate limit cho `login` và `register` bằng middleware `RateLimiter` có sẵn của ASP.NET Core (không thêm package): 10 yêu cầu/phút/IP, trả 429 (đã xác nhận, ADR-12). Phía sau reverse proxy cần cấu hình forwarded headers để lấy đúng IP.
- Chi tiết đã biết: token không bị thu hồi khi đăng xuất hoặc đổi mật khẩu (ADR-05).
