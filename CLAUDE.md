# CLAUDE.md — TaskFlow

Hướng dẫn làm việc lâu dài cho Claude Code. Tài liệu nghiệp vụ chi tiết nằm trong `docs/`, không lặp lại ở đây.

## 1. Tổng quan
TaskFlow: web app **quản lý công việc cá nhân**. Mỗi user chỉ thấy và thao tác dữ liệu của mình. Không phải công cụ quản lý nhóm (không giao việc, chia sẻ, chat, nhóm, thanh toán, avatar).
Chi tiết: `docs/requirements/`, `docs/business-analysis/`.

## 2. Tech Stack
- Backend: .NET 10, C#, ASP.NET Core Web API (Controllers), EF Core (Code First), Npgsql, FluentValidation, JWT Bearer.
- DB: PostgreSQL 16 (Docker).
- Frontend: Angular (standalone components) + NG-ZORRO.
- Test: xUnit; Integration test dùng Testcontainers PostgreSQL.
- Không thêm công nghệ/package ngoài stack khi chưa được xác nhận (không MediatR, AutoMapper, Serilog... trừ khi có lý do và được duyệt).

## 3. Kiến trúc (Clean Architecture)
```
API ──► Application ──► Domain
 │          ▲
 └► Infrastructure ─┘      (Infrastructure → Application → Domain)
```
- **Domain**: Entities, Enums, domain rules, `DomainException`. Không phụ thuộc gì.
- **Application**: Services theo nhóm (Auth, Tasks, Dashboard, Profile), DTOs, Validators, interfaces (`IAppDbContext`, `ICurrentUser`, `IJwtTokenService`, `IPasswordHasher`...). Không tham chiếu Infrastructure.
- **Infrastructure**: `AppDbContext`, EF configurations, migrations, JWT, password hashing.
- **API**: Controllers (mỏng), middleware, DI, auth config, Swagger. Chỉ API tham chiếu Infrastructure (để đăng ký DI).
- Application truy cập dữ liệu qua `IAppDbContext` (do Infrastructure cài đặt). Không dùng Repository pattern.

## 4. Cấu trúc thư mục
```
backend/src/{TaskManagement.Domain,Application,Infrastructure,API}
backend/tests/{TaskManagement.UnitTests,IntegrationTests}
frontend/            Angular app: src/app/{core,shared,layout,features/{auth,dashboard,tasks,profile}}
docs/{requirements,business-analysis,architecture,database,api,ui-design}
.claude/skills/      Skill thiết kế frontend (xem mục 11)
docker-compose.yml   PostgreSQL local
```

## 5. Coding Conventions
- C#: nullable bật, file-scoped namespace, `async` + `CancellationToken` ở mọi I/O, tên `PascalCase`; interface có tiền tố `I`.
- Không business logic trong Controller; Controller không truy cập DbContext.
- Business rule nằm ở Domain/Application; Backend là nơi cuối cùng thực thi.
- Không để TODO, placeholder, mock data trong tính năng đã tuyên bố xong.
- Angular: standalone + lazy routes, reactive forms, tách component / service / model; không nhét logic vào một component. Không dùng dữ liệu giả khi đã nối API.
- Comment chỉ giải thích "vì sao", không mô tả code.

## 6. Dependency Rules
- Domain → không gì. Application → Domain. Infrastructure → Application (+Domain). API → Application + Infrastructure.
- Vi phạm chiều tham chiếu là lỗi; kiểm tra khi thêm `ProjectReference`.

## 7. Database Conventions
- EF Core Code First; mọi thay đổi schema qua migration có tên rõ nghĩa. Không sửa migration đã áp dụng.
- Cấu hình bằng `IEntityTypeConfiguration<T>`, không dùng data annotation trong Domain.
- Thời gian lưu `timestamptz` (UTC). Enum lưu INT (Status: Todo=0, InProgress=1, Completed=2; Priority: Low=0, Medium=1, High=2).
- `Tasks.UserId` FK → `Users.Id` `ON DELETE CASCADE`. `Users.Email` unique (so khớp không phân biệt hoa thường: lưu email đã chuẩn hóa lowercase).
- Truy vấn chỉ đọc dùng `AsNoTracking`. Luôn phân trang danh sách.

## 7a. Bảo mật
- `UserId` lấy từ claim JWT qua `ICurrentUser`, **không bao giờ** tin UserId từ client.
- Mọi truy vấn task lọc theo user hiện tại. Task của người khác → **404** (không 403).
- Không lưu secret trong source; dùng env var / user-secrets. Không trả `PasswordHash`.

## 8. API Conventions
- REST, prefix `/api`. Thành công trả dữ liệu trực tiếp; danh sách: `{ items, page, pageSize, totalCount }`.
- Lỗi: RFC 7807 `ProblemDetails` (+ `errors` cho validation), xử lý tập trung bằng `IExceptionHandler`.
- Mã trạng thái: 200/201/204, 400 (validation), 401, 404, 409 (trùng email), 500.
- Enum trong JSON là chuỗi (`"InProgress"`). Thời gian ISO 8601 UTC.
- Swagger/OpenAPI bật ở môi trường Development.

## 9. Testing Conventions
- Unit tests: Domain rules, validators, logic thuần. Không phụ thuộc DB.
- Integration tests: API thật + PostgreSQL thật qua Testcontainers (cần Docker). Phải có test cô lập dữ liệu giữa hai user, filter/sort/pagination, trường hợp biên.
- Test kiểm tra hành vi, không viết cho có. Sửa lỗi trước khi sang task phụ thuộc.

## 10. Lệnh thường dùng
```bash
cp .env.example .env                       # lần đầu: đổi mật khẩu, sinh Jwt__Key (openssl rand -base64 48); .env bị gitignore
docker compose up -d --wait                # PostgreSQL 16 trên 127.0.0.1:5432
scripts/taskflow install                   # cài bản dùng riêng trên Mac (TaskFlow.app); lệnh start/stop/backup/update: scripts/taskflow help
docker compose --profile app up -d --build --wait   # tùy chọn: cả api + web (nginx) tại :8080; migrate: --profile tools run --rm migrate

cd backend
dotnet tool restore                        # lần đầu: cài dotnet-ef (local tool)
dotnet build TaskManagement.slnx           # warnings là lỗi; phải sạch
dotnet test  TaskManagement.slnx           # integration test cần Docker (Testcontainers)

set -a; . ../.env; set +a                  # nạp biến môi trường cho các lệnh dưới
dotnet tool run dotnet-ef database update --project src/TaskManagement.Infrastructure --startup-project src/TaskManagement.API
dotnet tool run dotnet-ef migrations add <Ten> --project src/TaskManagement.Infrastructure --startup-project src/TaskManagement.API --output-dir Persistence/Migrations
ASPNETCORE_URLS=http://localhost:5095 dotnet run --project src/TaskManagement.API   # Swagger: /swagger

cd frontend && npx -y npm@11 install      # npm 10.9 (đi kèm Node 22) lỗi "edgesOut" với cây phụ thuộc này
cd frontend && npm start                   # http://localhost:4200, proxy /api -> http://localhost:5095 (cần Backend đang chạy)
cd frontend && npm test                    # Vitest qua `ng test` (thêm --watch=false trong script/CI)
cd frontend && npm run build               # production, có ngân sách bundle (cảnh báo 1,2 MB)
```
Cập nhật mục này khi cấu trúc thay đổi.

Gotchas đã gặp:
- `dotnet ef` cần biến `ConnectionStrings__DefaultConnection`, nếu thiếu sẽ báo lỗi rõ ràng (cố ý, không có giá trị mặc định).
- API không khởi động nếu thiếu `ConnectionStrings:DefaultConnection` hoặc `Jwt:Key` < 32 byte (cố ý, fail fast).
- Analyzer ở mức `latest-recommended` + warnings-as-errors: dùng `[LoggerMessage]` thay cho `logger.LogX(...)`; thư mục `Migrations` được đánh dấu generated code trong `.editorconfig`.
- Record DTO: attribute validation đặt trên tham số constructor, không dùng `[property: ...]`.
- Frontend: `theme.less` là nguồn token duy nhất (xuất `--tf-*`); component NG-ZORRO mới phải được thêm vào danh sách `@import` trong đó, nếu không sẽ không có style. Mọi `<a nz-button>` đã được căn lại ở `styles.scss`.
- Frontend: sau khi submit form không hợp lệ phải gọi `revealAllErrors(form)`; `markAllAsTouched()` một mình không làm `nz-form-control` hiện lỗi.
- Frontend: route cha có `path: ''` và `children` cũng khớp `/`. Trang cho khách phải có đường dẫn tường minh, nếu không `guestGuard` gây vòng lặp chuyển hướng vô hạn (đã có test hồi quy; lỗi này làm treo cả bộ test vì vòng lặp là microtask).
- Frontend: overlay NG-ZORRO (dropdown, drawer) trong jsdom cần chuỗi sự kiện chuột đầy đủ và chờ timer thật; drawer dùng `NzDrawerService` (không phải `<nz-drawer>`) để không để link ẩn trong DOM.
- Frontend: chạy test có thể treo nếu có vòng lặp đồng bộ; dùng script có giới hạn thời gian, không dùng `perl alarm` (không diệt được tiến trình con của npx).
- Frontend: `NzModalService` không `providedIn: 'root'` (khác `NzMessageService`); `ConfirmService` cần `importProvidersFrom(NzModalModule)` trong `app.config.ts`. Thiếu nó thì trang chi tiết/danh sách sập khi chạy thật (`NG0201`) mà unit test mock không thấy; `app.config.spec.ts` dùng đúng provider thật để bắt lỗi dạng này.
- Frontend: ô chọn ngày kèm giờ (`nzShowTime`) chỉ chốt giá trị sau khi bấm "Ok" và giá trị gõ tay không được chấp nhận; dùng ô chọn **ngày** để chọn là xong. Nhấn Enter trong ô chọn ngày không được gửi form (`keepPickerEnterFromSubmitting`).
- Frontend: lỗi từ server phải `markAsDirty/Touched` **trước** `setErrors`, nếu không ô chưa chạm tới không hiện lỗi; sửa bất kỳ ô nào thì xóa mọi lỗi từ server.
- Frontend: `Validators.required` coi chuỗi toàn khoảng trắng là hợp lệ; dùng thêm `notBlankValidator`.
- Frontend: custom element mới (`<tf-...>`) mặc định là `display: inline`; component cần chiều rộng phải đặt `:host { display: block }`.
- Frontend: `ng-zorro` overlay/pagination trong jsdom cần `provideNzI18n(vi_VN)` + `LOCALE_ID 'vi'` (xem `features/tasks/test-support.ts`); hộp thoại chỉ đóng sau animation CSS nên không thể kiểm bằng jsdom, chỉ kiểm nội dung.
- Frontend: kiểm tra trình duyệt thật tìm ra nhiều lỗi mà unit test không thấy (provider thiếu, bố cục, mất dữ liệu ở ô ngày); sau mỗi tính năng UI phải xem bằng trình duyệt với Backend thật.
- Frontend: `ng new` tự tạo `.vscode/mcp.json` đăng ký một MCP server; đã xóa vì chưa được yêu cầu.
- Frontend (Lịch ngày): test dùng ngày thật sẽ vỡ khi sang ngày mới; ghim `Date` trong spec. Khối kết thúc đúng 24:00 là hợp lệ (không phải qua nửa đêm). Khi sửa SCSS hàng loạt bằng script, kiểm tra lại selector kép (một lần thay sai làm gạch ngang mọi tiêu đề).
- Production/Docker: CSP của nginx cấm script inline nên `angular.json` tắt `inlineCritical`; bật lại sẽ làm trang trắng lỗi CSP. `ForwardedHeaders:Enabled` thiếu danh sách proxy thì API không khởi động (cố ý).
- Frontend (v2): mọi chuỗi giao diện nằm trong `core/i18n/messages/{vi,en}.ts` (khóa có kiểu); dùng `{{ 'khóa' | t }}` hoặc `i18n.t()`. Thêm khóa vào **cả hai** file (test `messages.spec.ts` kiểm cùng khóa và cùng tham số). Hàm thuần nhận `t` tùy chọn (mặc định tiếng Việt) để test không cần TestBed.
- Frontend (v2): màu chỉ dùng token `--tf-*` (có bộ sáng và tối); chữ trên nền màu dùng `--tf-on-color`. NG-ZORRO đọc `var(--tf-*)` nên đừng đưa biến đã qua hàm Less vào `theme.less` (build lỗi `shade`/`darken`).
- Frontend (v2): test chạy với trình duyệt giả tiếng Việt và "giảm chuyển động" (`src/test-setup.ts`): số hiện giá trị cuối ngay, không có confetti. Test hoạt họa phải tự thay `matchMedia`.
- Frontend (v2): chuyển động chỉ CSS + View Transitions + rAF; `prefers-reduced-motion` phải tắt hết. Không thêm thư viện chuyển động.
- macOS: ứng dụng mở từ Finder không đọc được `~/Documents` (TCC, báo "Operation not permitted"), nên `scripts/taskflow install` chạy từ bản sao ở `~/Library/Application Support/TaskFlow/app`; sửa mã xong phải `scripts/taskflow update`. Gói `.app` tự tạo bằng script không bị quarantine nên mở được ngay.
- Ứng dụng Mac độc lập (`desktop/`, ADR-19): terminal của VS Code đặt `ELECTRON_RUN_AS_NODE=1` nên chạy Electron từ đó thoát ngay, không báo lỗi (chỉ log `task_name_for_pid`); dùng `env -u ELECTRON_RUN_AS_NODE`. `open` từ terminal đó cũng truyền biến này. bash trên macOS là 3.2 (không có `declare -A`); trong zsh đừng đặt biến vòng lặp tên `path` (nó gắn với `PATH`). Không có `playwright` trong `desktop/`; kiểm thử bằng cách chạy app với `TASKFLOW_USER_DATA`/`TASKFLOW_HIDDEN=1` rồi gọi API qua cổng loopback (`lsof -p <pid API>`).
- Node: dùng `node@22` của Homebrew (đã `brew link --force node@22`, v22.23.5). Formula `node` 25 còn trong Cellar nhưng đã unlink và đang hỏng (thiếu libsimdjson sau khi Homebrew nâng simdjson); có thể `brew uninstall node` để dọn.
- EF/Npgsql: chỉ `ToLower()` (không phải `ToLowerInvariant()`) và `Contains(string)` được dịch sang SQL; analyzer CA1304/CA1311/CA1862 bị tắt cục bộ đúng một chỗ trong `TaskService.ApplyFilters` vì lý do này. Truy vấn LINQ chỉ lộ lỗi dịch khi chạy với provider thật, nên logic truy vấn phải được test trên Postgres thật.
- Npgsql từ chối `DateTimeOffset` có offset khác 0 làm tham số `timestamptz`: mọi giá trị thời gian từ client phải `ToUniversalTime()` trước khi vào truy vấn (Domain đã làm cho đường ghi; `ApplyFilters` làm cho đường lọc).
- Thứ tự `Guid` của .NET khác thứ tự `uuid` của PostgreSQL. Test cần thứ tự theo Id phải sắp theo chuỗi hex (`StringComparer.Ordinal`).
- Không đặt `[Produces("application/json")]` trên controller: nó ép lỗi binding thành `application/json` thay vì `application/problem+json`.
- Chạy kiểm thử đột biến (sửa code rồi khôi phục): phải cập nhật mtime của file đã khôi phục, nếu không MSBuild giữ binary cũ và kết quả sau đó sai.
- Gói `Microsoft.EntityFrameworkCore.Relational` được ghim tường minh cùng phiên bản EF Core trong Infrastructure (Npgsql chỉ kéo bản tối thiểu, gây lệch phiên bản ở API).

## 11. Frontend design (skill trong `.claude/skills/`)
- Trước khi viết UI, đọc `frontend-design` và `modern-web-design`. Lập **kế hoạch thiết kế** (palette 4–6 hex, typography, layout, nguyên tắc), tự phản biện so với mặc định "AI-generated" rồi mới code. Ghi kết quả vào `docs/ui-design/`.
- Tránh: nền kem + serif + màu đất nung; nền đen + một màu neon; lưới thẻ giống hệt nhau, một border-radius và một bóng cho tất cả; nhãn VIẾT HOA phía trên mọi tiêu đề; nhấn một từ trong heading; chuỗi `A · B · C`; `→` sau mọi link.
- Chất lượng tối thiểu: responsive, focus nhìn thấy, `prefers-reduced-motion`, tương phản đạt WCAG AA, skeleton cho loading, chuyển động chỉ khi có mục đích.
- Copy: góc nhìn người dùng, động từ rõ ràng ("Lưu thay đổi"), cùng một hành động giữ cùng một tên xuyên suốt (nút "Xóa" → toast "Đã xóa"), lỗi nêu rõ nguyên nhân và cách sửa, empty state mời hành động.
- Ngoại lệ: ví dụ trong skill dùng React/GSAP/Three.js — **chỉ lấy nguyên tắc**, triển khai bằng Angular + NG-ZORRO. `lottie-animations` ngoài stack, không dùng nếu chưa được duyệt.
- Tùy biến NG-ZORRO qua design token (theme), không ghi đè CSS tràn lan.

## 12. Quy tắc làm việc
1. Khảo sát repo/Git trước khi sửa. Không giả định có sẵn code.
2. Chia việc nhỏ, kiểm chứng được. Trước mỗi phase nêu mục tiêu + file dự kiến; sau mỗi task build + test.
3. Không đổi kiến trúc đã thống nhất; nếu cần, giải thích và xin xác nhận.
4. Không tạo abstraction/pattern/package không cần thiết.
5. **Không tự commit, push, tạo PR.** Không thêm git remote.
6. Không dùng multi-agent; làm tuần tự.
7. Không xóa/ghi đè file hiện có khi chưa kiểm tra.
8. Quyết định kỹ thuật quan trọng ghi vào `docs/architecture/`.
