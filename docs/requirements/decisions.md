# Quyết định đã chốt (2026-11-12)

Các điểm chưa rõ trong đặc tả ban đầu và quyết định đã được xác nhận.

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Tên | Root `TaskFlow/`; solution/namespace `TaskManagement.*`; UI hiển thị "TaskFlow" |
| 2 | Logout | JWT stateless, access token 60 phút, không refresh token/blacklist; logout trả 204, client xóa token. Hạn chế đã biết: token không bị thu hồi trước hạn |
| 3 | Đổi email | Yêu cầu mật khẩu hiện tại + kiểm tra trùng; không xác minh qua email ở v1 |
| 4 | Mật khẩu | ≥ 8 ký tự, có hoa, thường, số; hash PBKDF2 qua `PasswordHasher<T>` |
| 5 | Múi giờ | Lưu UTC; quá hạn = `DueDate < now` và chưa Completed; chọn ngày không giờ → cuối ngày local ở Frontend |
| 6 | Lọc hạn | `dueFrom`, `dueTo`, `overdue=true` |
| 7 | Enum | DB lưu INT; API dùng chuỗi |
| 8 | Sort DueDate null | Xếp cuối ở cả hai chiều |
| 9 | Dashboard | Sắp đến hạn: chưa Completed, hạn trong 7 ngày tới, chưa quá hạn, 5 task; mới cập nhật: 5 task theo `UpdatedAt` giảm dần |
| 10 | Xóa user | `ON DELETE CASCADE` |
| 11 | Response | Dữ liệu trực tiếp; danh sách `{items,page,pageSize,totalCount}`; lỗi ProblemDetails (RFC 7807) |
| 12 | API style | Controllers |
| 13 | Use case | Application Services, không MediatR |
| 14 | Truy cập dữ liệu | `IAppDbContext` trong Application, Infrastructure cài đặt; không Repository |
| 15 | Schema | Không thêm `CompletedAt` |
| 16 | Đổi mật khẩu | Không vô hiệu hóa token cũ (ghi nhận hạn chế) |
| 17 | Lưu token ở FE | `localStorage` |
| 18 | UI design docs | Markdown mô tả layout + design tokens |
| 19 | Phương pháp | Tuần tự, không multi-agent |
| 20 | Git | `git init` cục bộ; không commit/push/remote nếu chưa được yêu cầu |
| 21 | Logging | `ILogger` mặc định |
| 22 | Unit vs integration | Unit test không DB; logic truy vấn kiểm bằng integration test Postgres thật |
| 23 | Task người khác | 404 |

## Bổ sung ở Phase 1

| # | Chủ đề | Quyết định |
|---|---|---|
| 24 | Ngôn ngữ UI | Đã xác nhận: tiếng Việt, nhãn ngắn (Chưa làm / Đang làm / Hoàn thành; Thấp / Trung bình / Cao) |
| 25 | Đăng ký | Trả token luôn (tự đăng nhập sau khi đăng ký) |
| 26 | Nội dung JWT | Chỉ `sub`, `jti`, `iat`, `exp`, `iss`, `aud` |
| 27 | Ràng buộc DB bổ sung | CHECK cho Status, Priority và `StartDate <= DueDate` |
| 28 | Rate limit login/register | Đã xác nhận (ADR-12): 10 yêu cầu/phút/IP |
| 29 | Swagger UI | **Mở**, chốt ở Phase 2 (ADR-13) |
| 30 | Font self-host qua `@fontsource` | **Chờ xác nhận** ở Phase 4 (package ngoài stack) |

## Bổ sung ở Phase 5

| # | Chủ đề | Quyết định |
|---|---|---|
| 44 | Hạn hoàn thành trên form | Chọn **ngày**, không chọn giờ: hạn là hết ngày đó (23:59 giờ địa phương). Lý do: ô chọn ngày kèm giờ của NG-ZORRO chỉ chốt giá trị sau khi bấm "Ok", nên người dùng chọn ngày rồi bấm lưu sẽ mất hạn mà không biết. Task đã có giờ cụ thể (đặt qua API) giữ nguyên giờ nếu người dùng không đổi ngày |
| 45 | Câu chào Dashboard | Chỉ dùng số liệu thật (còn N việc chưa xong, M việc quá hạn); không có câu "hôm nay còn..." vì API không trả số đó. Người dùng mới chỉ thấy lời chào và trạng thái rỗng |
| 46 | Trạng thái lọc | Nằm trên URL (UC-11): bộ lọc, sắp xếp, trang và cỡ trang. Giá trị sai trên URL rơi về mặc định, không báo lỗi. Gõ tìm kiếm không thêm mục lịch sử trình duyệt |
| 47 | Lỗi từ server trên form | Sửa bất kỳ ô nào thì xóa mọi lỗi từ server, vì lỗi mô tả cả lần gửi (một lỗi ngày bắt đầu/hạn liên quan tới cả hai ô) |
| 48 | Tên người dùng | Gọi bằng từ cuối của họ tên ("Nguyễn Văn An" thành "An") |
| 49 | Ngân sách bundle | Cảnh báo 1,2 MB (nâng từ 1,1 MB khi làm giao diện v2: font Baloo 2, bố cục mới), lỗi 1,5 MB (raw). Bundle ban đầu ~1,07 MB, 212 KB khi truyền; phần lớn là Angular, NG-ZORRO, CDK và date-fns cho shell, mã ứng dụng khoảng 15 KB |
| 50 | Không làm | Cảnh báo "thay đổi chưa lưu" khi rời form; chọn giờ cụ thể cho hạn (xem #44) |
| 51 | Công việc theo khối giờ (thay đổi yêu cầu, bổ sung #44) | Việc là một khối thời gian trong ngày: giờ bắt đầu + thời lượng theo phút (gợi ý nhanh 15 phút, 30 phút, 1/2/3/4 giờ, hoặc nhập số phút). `StartDate` nay mang cả giờ; hạn hoàn thành (`DueDate`) vẫn chọn theo ngày như #44 |
| 52 | Trang Lịch ngày | `/schedule?date=`: trục giờ 06:00–22:00 (mở rộng khi có việc ngoài khoảng), việc chồng giờ chia làn cạnh nhau, khối ngắn hơn 15 phút vẽ như 15 phút, có giờ bắt đầu mà chưa có thời lượng thì vẽ 30 phút nét đứt (ước lượng), bấm ô trống để tạo việc điền sẵn ngày và giờ. Việc đến hạn trong ngày nhưng chưa xếp giờ hiện ở danh sách bên cạnh |
| 53 | Ranh giới ngày | Khối kết thúc đúng 24:00 hợp lệ; vượt qua nửa đêm bị từ chối ở form (không tách khối) |

## Bổ sung ở Phase 4

| # | Chủ đề | Quyết định |
|---|---|---|
| 37 | Phiên bản | Angular 21.2 + ng-zorro-antd 21.3.3 (bản mới nhất 22.x cần Angular 22, trong khi CLI trên máy là 21) |
| 38 | Cơ chế theme | NG-ZORRO 21 theme bằng biến Less; cài thêm `less` (devDependency). `src/theme.less` là nguồn token duy nhất, vừa cấu hình NG-ZORRO vừa xuất CSS custom property `--tf-*`. Chỉ nhập style của các component dùng tới (420 KB thay vì 740 KB) |
| 39 | Font | `@fontsource` tự host, chỉ subset `latin` + `vietnamese`; Bricolage Grotesque 600/700, Be Vietnam Pro 400/500/600. Đã xác nhận Bricolage có đủ dấu tiếng Việt |
| 40 | Kéo trang Login lên Phase 4 | Guard cần một trang đích thật (nếu `/login` không tồn tại sẽ vòng lặp chuyển hướng). Register vẫn ở Phase 5 |
| 41 | Gọi API | Đường dẫn tương đối `/api`; dev server proxy sang `localhost:5095` (`proxy.conf.json`), production cần reverse proxy cùng origin. Không dùng CORS |
| 42 | npm | npm 10.9 (kèm Node 22) lỗi `edgesOut` khi giải quyết cây phụ thuộc; cài bằng `npx -y npm@11 install`, không đổi npm toàn cục |
| 43 | Phiên hết hạn | Token hết hạn hoặc bị server từ chối (401) thì xóa phiên và về `/login` kèm lý do `expired` và `returnUrl` đã được làm sạch (chống open redirect) |

## Bổ sung ở Phase 3

| # | Chủ đề | Quyết định |
|---|---|---|
| 31 | PUT task | `priority` và `status` bắt buộc; thiếu thì 400 (không mặc định lặng lẽ) |
| 32 | Tìm theo tiêu đề | `lower()` + `strpos` qua `ToLower().Contains()`, không dùng `ILIKE` |
| 33 | Giới hạn page | `page ≤ 100000` |
| 34 | Đăng nhập | Email không tồn tại vẫn chạy một lần verify hash giả để thời gian phản hồi không lộ email đã đăng ký |
| 35 | Xóa task | Load rồi `Remove` (không `ExecuteDelete`, vì Application không tham chiếu package Relational) |
| 36 | Đăng ký trùng đồng thời | Chặn bởi unique index; service bắt `DbUpdateException` rồi kiểm tra lại email để trả 409 thay vì 500 |
| 54 | Giao diện v2 | Thiết kế lại cả 8 màn hình theo [design-plan-v2.md](../ui-design/design-plan-v2.md): "Tí và bảng dán", mức chuyển động "rất sống động" nhưng không thêm thư viện chuyển động |
| 55 | Đa ngôn ngữ | Tiếng Việt, English, 日本語 và 简体中文 (thêm ja, zh sau; cả giao diện lẫn thông báo lỗi của Backend), đổi tức thì, lưu lựa chọn, mặc định theo trình duyệt. Dịch vụ tự viết (không thêm package): xem ADR-17 |
| 56 | Sáng/tối | Sáng, Tối, Theo hệ thống (mặc định); lưu lựa chọn; đặt `data-theme` trước khi hiển thị |
| 57 | Font | Thêm `@fontsource/baloo-2` (tiêu đề); Bricolage Grotesque bị thay |
| 59 | Cài trên Mac | Phương án "PWA + gói `TaskFlow.app` khởi động" (không Electron/Tauri, không đổi DB): cài từ Chrome, DB mới sạch, chỉ chạy khi bấm `TaskFlow.app`, không tự chạy khi đăng nhập. Thiết kế ở deployment.md |
| 62 | Giữ đăng nhập lâu | Refresh token xoay vòng 90 ngày kể từ lần dùng cuối, bảng `RefreshTokens` (ADR-20). Danh sách việc: việc Completed luôn xuống cuối mọi kiểu sắp xếp |
| 61 | Báo cáo ở Tổng quan | Báo cáo tuần/tháng/năm: giờ làm việc và số việc hoàn thành, kèm trung bình mỗi ngày/tuần/tháng. Giờ làm việc = thời lượng của việc **đã hoàn thành**, tính vào ngày bắt đầu (không thêm trường `CompletedAt`, không đổi schema). Biểu đồ vẽ bằng CSS, không thêm thư viện. Chi tiết ở api-spec.md |
| 60 | Ứng dụng Mac độc lập | Thay quyết định 59 trên máy chủ dự án: Electron + API tự chứa + PostgreSQL nhúng, không trình duyệt/Docker, chỉ Apple Silicon của chính họ, không ký Developer ID. Xem ADR-19 |
| 58 | Thông báo lỗi theo ngôn ngữ | Frontend gửi `Accept-Language` (`vi` hoặc `en`); Backend dịch `title`, `detail` và từng lỗi trường ở lớp API (ADR-18). Mặc định tiếng Việt khi thiếu header hoặc ngôn ngữ không hỗ trợ |
