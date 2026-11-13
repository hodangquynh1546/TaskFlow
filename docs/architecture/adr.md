# Architecture Decision Records

Định dạng rút gọn: Bối cảnh → Quyết định → Hệ quả. Quyết định mới hoặc đổi quyết định cũ phải được thêm vào đây và cần xác nhận.

## ADR-01 Clean Architecture 4 lớp
- **Bối cảnh:** đặc tả yêu cầu tách Domain / Application / Infrastructure / API và dependency rule.
- **Quyết định:** như đặc tả. Domain không phụ thuộc gì; Application chỉ phụ thuộc Domain; Infrastructure phụ thuộc Application; API ghép tất cả.
- **Hệ quả:** có test tự động bảo vệ hướng tham chiếu. Thêm chút boilerplate, chấp nhận vì yêu cầu rõ ràng.

## ADR-02 `IAppDbContext` thay cho Repository
- **Bối cảnh:** Application không được tham chiếu Infrastructure, đồng thời đặc tả cấm lạm dụng Repository.
- **Quyết định:** Application định nghĩa `IAppDbContext` (`DbSet<User>`, `DbSet<TaskItem>`, `SaveChangesAsync`), `AppDbContext` cài đặt. Application dùng LINQ qua interface này.
- **Hệ quả:** Application có phụ thuộc vào package EF Core (abstraction), không vào Npgsql hay cấu hình cụ thể. Đổi nhà cung cấp DB không động tới Application. Đổi lại nếu muốn bỏ hẳn EF khỏi Application sẽ phải thêm Repository: không có nhu cầu.

## ADR-03 Application Services, không MediatR
- **Quyết định:** mỗi nhóm chức năng một service (`IAuthService`, `ITaskService`, `IDashboardService`, `IUserProfileService`) với các phương thức theo use case.
- **Hệ quả:** ít package, dễ đọc, dễ debug. Nếu service phình to thì tách theo use case sau.

## ADR-04 Controllers, ProblemDetails
- **Quyết định:** MVC Controllers; lỗi theo RFC 7807 qua `IExceptionHandler` tập trung; thành công trả dữ liệu trực tiếp, không bọc envelope.
- **Hệ quả:** khớp chuẩn .NET và Swagger; Frontend dùng một cách xử lý lỗi duy nhất.

## ADR-05 JWT stateless, không refresh token
- **Quyết định:** access token 60 phút; không refresh token, không blacklist, không security stamp (không thêm bảng).
- **Hệ quả (hạn chế đã biết):** logout chỉ xóa token phía client; đổi mật khẩu không vô hiệu hóa token đang lưu hành; hết hạn thì phải đăng nhập lại. Chấp nhận cho v1. Hướng nâng cấp: refresh token xoay vòng + bảng `RefreshTokens`, cần bạn duyệt vì thêm bảng.
- Token lưu `localStorage` (ADR-06).

## ADR-06 Lưu token ở localStorage
- **Quyết định:** `localStorage`; giảm rủi ro XSS bằng CSP phía host, Angular mặc định escape, không dùng `innerHTML` với dữ liệu người dùng.
- **Hệ quả:** nếu có XSS thì token bị lộ. Phương án cookie HttpOnly cần thêm CSRF, hoãn lại.

## ADR-07 Quyền sở hữu ép trong truy vấn, trả 404
- **Quyết định:** mọi truy vấn task có `Where(t => t.UserId == currentUser.Id)`; không tìm thấy hoặc không phải của mình đều 404.
- **Hệ quả:** không lộ sự tồn tại của task người khác; không có cửa sổ kiểm tra sau khi đọc. Integration test kiểm chứng bằng hai user.

## ADR-08 Thời gian
- **Quyết định:** UTC toàn hệ thống, `timestamptz`, dùng `TimeProvider`. Frontend hiển thị theo múi giờ local; ngày không kèm giờ nghĩa là cuối ngày local.
- **Hệ quả:** quy tắc quá hạn (BR-09) kiểm thử được bằng đồng hồ giả.

## ADR-09 Email chuẩn hóa chữ thường, unique index
- **Quyết định:** lưu `lower(trim(email))` + unique index; không dùng `citext`.
- **Hệ quả:** không phụ thuộc extension Postgres; mọi chỗ nhập email phải qua cùng một hàm chuẩn hóa.

## ADR-10 Enum lưu INT, API dùng chuỗi
- **Quyết định:** xem [schema.md](../database/schema.md). Giá trị số bất biến.

## ADR-11 Phân trang offset
- **Quyết định:** `page`/`pageSize` (≤ 50), thứ tự ổn định bằng khóa phụ `Id`.
- **Hệ quả:** đủ cho quy mô cá nhân; keyset pagination chỉ cần khi dữ liệu rất lớn.

## ADR-12 Giới hạn tần suất đăng nhập/đăng ký
- **Quyết định (đã xác nhận):** `Microsoft.AspNetCore.RateLimiting` có sẵn trong framework, 10 yêu cầu/phút/IP cho `login` và `register`.
- **Hệ quả:** giảm dò mật khẩu; phía sau reverse proxy cần cấu hình forwarded headers để lấy đúng IP.

## ADR-14 Angular 21 + NG-ZORRO 21, theme bằng Less
- **Bối cảnh:** kế hoạch UI cần bo góc 6px, font riêng và bảng màu riêng. Kiểm tra thực tế ng-zorro-antd 21.3.3: CSS dựng sẵn (`variable.css`) chỉ cho đổi màu qua CSS variable, còn bo góc (`2px`, 140 chỗ) và font bị cố định; theme đầy đủ chỉ làm được bằng biến Less.
- **Quyết định:** biên dịch Less với biến tùy chỉnh trong `src/theme.less`, đồng thời xuất các token dưới dạng CSS custom property cho component của ta. Nhập có chọn lọc từng `style/entry.less` của component dùng tới. Dùng Angular 21 thay vì 22 vì ng-zorro 22 yêu cầu Angular 22 và CLI trên máy là 21.
- **Hệ quả:** thêm `less` (công cụ build). Component NG-ZORRO mới dùng tới phải được thêm vào danh sách import trong `theme.less`, nếu không sẽ hiển thị không style. Khi nâng lên NG-ZORRO 22 cần kiểm tra lại cơ chế theme.

## ADR-15 Frontend gọi API cùng origin qua `/api`
- **Quyết định:** `API_BASE_URL` mặc định `/api`. Dev server proxy tới Backend; production đặt sau reverse proxy cùng origin. Interceptor chỉ gắn token và chuẩn hóa lỗi cho URL bắt đầu bằng `/api/` (không bao giờ gửi token ra origin khác).
- **Hệ quả:** không cần cấu hình CORS cho Frontend trong production. CORS ở Backend (cho `http://localhost:4200`) chỉ còn dùng khi chạy dev không qua proxy.

## ADR-16 Forwarded headers opt-in, đóng gói bằng Docker Compose
- **Bối cảnh:** sau reverse proxy, IP socket là IP của proxy nên limiter theo IP (ADR-12) gộp mọi người dùng vào một hạn mức. Nhưng tin `X-Forwarded-For` từ bất kỳ ai cho phép client tự chọn IP để né limiter.
- **Quyết định:** `ForwardedHeaders:Enabled` mặc định tắt; khi bật phải khai báo proxy/mạng tin cậy (thiếu thì fail fast), chỉ lấy một bước (`ForwardLimit = 1`). Dockerfile cho Backend (có target `migrate` chạy một lần) và Frontend (nginx không đặc quyền), compose dùng profile `app`/`tools` để lệnh dev cũ không đổi. nginx ghi đè `X-Forwarded-For` bằng `$remote_addr`. CSP nghiêm (`script-src 'self'`), nên tắt `inlineCritical` trong build production vì Angular chèn `onload` inline bị CSP chặn.
- **Hệ quả:** có 5 integration test (proxy tin cậy, mạng tin cậy, người gọi không tin cậy không né được limiter, mặc định tắt, thiếu danh sách thì lỗi). Không thêm package.

## ADR-17 i18n tự viết, giao diện sáng/tối bằng biến CSS
- **Bối cảnh:** cần Việt/English đổi tức thì và chế độ tối. `@angular/localize` dịch lúc build (không đổi tức thì); ngx-translate là package mới.
- **Quyết định:** `I18nService` dựa trên signals (từ điển có kiểu `MessageKey`, tham số `{x}`, số nhiều ICU rút gọn qua `Intl.PluralRules`), `TranslatePipe` không thuần. Hàm thuần (hạn, thời lượng...) nhận hàm dịch tùy chọn, mặc định tiếng Việt. Tiêu đề trang qua `TitleStrategy` đọc `data.titleKey`. Màu: NG-ZORRO đọc `var(--tf-*)` (chỉ các biến màu đơn giản, vì antd chạy hàm Less lên biến còn lại) nên một bản CSS phục vụ cả hai chế độ; component NG-ZORRO `notification` bỏ khỏi `theme.less` (không dùng, và nó áp `shade()` lên biến màu).
- **Hệ quả:** thêm ngôn ngữ = thêm một file từ điển; test bắt buộc hai từ điển cùng khóa và cùng tham số. CSP phải tắt `inlineCritical` (ADR-16).

## ADR-18 Dịch thông báo lỗi ở lớp API theo Accept-Language
- **Bối cảnh:** giao diện có hai ngôn ngữ nhưng Domain/Application viết thông báo bằng tiếng Việt. Dịch ở từng nơi sẽ làm Domain phụ thuộc localization.
- **Quyết định:** giữ tiếng Việt làm ngôn ngữ nguồn; `ProblemMessages` (API) chọn ngôn ngữ từ `Accept-Language` (theo q, `vi`/`en`/`ja`/`zh`, mặc định `vi`; mỗi thông báo có một bản dịch cho từng ngôn ngữ trong cùng một bảng) và dịch `title`, `detail`, lỗi từng trường trong một chỗ (`CustomizeProblemDetails` và `InvalidModelStateResponseFactory`); đặt `Content-Language` và `Vary: Accept-Language`. Thông báo có số dùng mẫu regex.
- **Hệ quả:** không thêm package; Domain/Application không đổi. Test đọc mã nguồn và **thất bại nếu một thông báo tiếng Việt mới không có bản dịch** (`MessageCompletenessTests`). Thêm ngôn ngữ = thêm một bảng. Thông báo không có bản dịch vẫn trả tiếng Việt, không đoán.

## ADR-19 Ứng dụng Mac độc lập: Electron + API tự chứa + PostgreSQL nhúng
- **Bối cảnh:** chủ dự án muốn TaskFlow cài trên máy như một ứng dụng thật (như Zalo): không trình duyệt, không Docker. Bản "PWA + launcher Docker" (quyết định 59) vẫn cần cả hai. Chỉ dùng cho máy của chính họ (Apple Silicon).
- **Quyết định:** thư mục `desktop/`. Electron chỉ là vỏ cửa sổ; khi mở nó chạy PostgreSQL 16 nhúng (bản EnterpriseDB đóng gói bởi zonky, ghim phiên bản, kiểm SHA1, chỉ giữ arm64) trên cổng loopback ngẫu nhiên, chạy `TaskManagement.API migrate`, rồi chạy API .NET đã `publish --self-contained`. API tự phục vụ luôn bản build Angular (`Hosting:ServeSpa`, mặc định tắt nên Docker/nginx không đổi), nên cả ứng dụng là một origin loopback. Giữ PostgreSQL thay vì đổi sang SQLite để không đổi kiến trúc, migration và hành vi tìm kiếm chữ Việt.
- **Vòng đời:** dữ liệu ở `~/Library/Application Support/TaskFlow Desktop` (tách khỏi dữ liệu Docker). Mật khẩu DB và khóa JWT sinh lần đầu, mã hóa bằng Keychain (`safeStorage`). Đóng cửa sổ là thoát hẳn: dừng API rồi PostgreSQL (SIGINT = fast shutdown). Sau khi bị buộc dừng, lần mở sau dọn PostgreSQL cũ (`postmaster.pid`) và API cũ (`api.pid`, chỉ khi tiến trình đó còn là đúng file API). Sao lưu = dừng cả hai rồi nén thư mục dữ liệu; khôi phục giữ lại `pgdata.before-restore-*`.
- **Hệ quả:** gói 451 MB; không ký Developer ID/notarize (chỉ ký ad hoc, đủ cho Apple Silicon trên máy build); chia sẻ cho người khác cần Developer ID. Không có `pg_dump`, nên không xuất `.sql`. Locale `en_US.UTF-8` bắt buộc để `lower()` đúng với chữ Việt (đã kiểm trên macOS).

## ADR-13 Công cụ tạo tài liệu Swagger UI
- **Bối cảnh:** .NET 10 có `Microsoft.AspNetCore.OpenApi` sinh tài liệu nhưng không kèm giao diện.
- **Quyết định (Phase 2):** `Swashbuckle.AspNetCore` 10.3.1 (một package, vừa sinh tài liệu vừa có Swagger UI). Bản 11.0.0 nhắm .NET 11 nên không dùng. Swagger chỉ bật ở Development và khai báo sẵn Bearer auth.
- **Hệ quả:** đã có test xác nhận `swagger.json` phục vụ ở Development và không lộ ở Production.
