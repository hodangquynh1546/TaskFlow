# TaskFlow

Ứng dụng web quản lý công việc cá nhân: tạo, phân loại, theo dõi tiến độ và hạn hoàn thành, kèm Dashboard tổng quan.

> **Trạng thái:** Hoàn thành Phase 0–7: 8 màn hình nối API thật, công việc theo khối giờ kèm trang Lịch ngày, giao diện v2 (vui nhộn, hoạt họa, Việt/English, sáng/tối), tài liệu và checklist bàn giao.

## Tech stack
.NET 10 Web API (Clean Architecture) · EF Core · PostgreSQL 16 · Angular + NG-ZORRO

## Yêu cầu môi trường
- .NET SDK 10
- Docker (PostgreSQL và integration tests)
- Node.js **LTS chẵn (22 hoặc 24)** + npm, Angular CLI. Node 25 không được Angular hỗ trợ.

## Bắt đầu nhanh
```bash
cp .env.example .env                 # đổi POSTGRES_PASSWORD (hai chỗ: biến riêng và trong chuỗi kết nối) và sinh Jwt__Key
openssl rand -base64 48              # dán kết quả vào Jwt__Key trong .env
docker compose up -d --wait          # PostgreSQL 16 trên 127.0.0.1:5432
```
Sau đó chạy Backend, rồi Frontend như bên dưới và mở http://localhost:4200.

## Chạy Backend
```bash
cd backend
dotnet tool restore
set -a; . ../.env; set +a
dotnet tool run dotnet-ef database update --project src/TaskManagement.Infrastructure --startup-project src/TaskManagement.API
ASPNETCORE_URLS=http://localhost:5095 dotnet run --project src/TaskManagement.API
```
Kiểm tra: `curl http://localhost:5095/health` và mở `http://localhost:5095/swagger`.

## Chạy Frontend
```bash
cd frontend
npx -y npm@11 install      # npm 10.9 lỗi với cây phụ thuộc này, nên dùng npm 11 qua npx
npm start                  # http://localhost:4200 (proxy /api tới http://localhost:5095, cần chạy Backend)
```
Cần Node 22 (`.nvmrc`). Chi tiết: [frontend/README.md](frontend/README.md).

## Chạy toàn bộ bằng Docker
```bash
docker compose --profile app up -d --build --wait
docker compose --profile tools run --rm migrate
```
Mở http://localhost:8080. Chi tiết và cảnh báo (chưa có TLS): [deployment.md](docs/architecture/deployment.md).

## Ứng dụng Mac độc lập (không cần Docker hay trình duyệt)

TaskFlow chạy như một ứng dụng thật trên Mac Apple Silicon: có cửa sổ và icon riêng, tự chạy PostgreSQL và API bên trong, không cần Docker, Chrome hay .NET.

```bash
cd desktop && npm install      # lần đầu
scripts/build.sh --install     # dựng và chép vào ~/Applications/TaskFlow.app (gỡ bản launcher Docker nếu có)
```
- Mở **TaskFlow** từ Launchpad/Spotlight. Đóng cửa sổ là thoát hẳn, không còn tiến trình nền.
- Dữ liệu: `~/Library/Application Support/TaskFlow Desktop/` (tách khỏi bản Docker). Menu của ứng dụng có Sao lưu, Khôi phục, mở thư mục dữ liệu và nhật ký. Sao lưu là một file `.tar.gz` của thư mục dữ liệu.
- Cập nhật sau khi sửa mã: chạy lại `scripts/build.sh --install`; dữ liệu giữ nguyên.
- Chỉ ký ad hoc nên chạy được trên máy build; đưa cho người khác cần Developer ID. Thiết kế: ADR-19.

## Cài như ứng dụng trên Mac bằng Docker (phương án cũ)

Chạy TaskFlow riêng trên máy bạn, có icon trong Dock, dữ liệu riêng và bí mật tự sinh. Cần Docker Desktop và Google Chrome.

```bash
scripts/taskflow install      # tạo ~/Applications/TaskFlow.app và "Dừng TaskFlow.app"
```
1. Bấm **TaskFlow** (Launchpad, Spotlight hoặc `~/Applications`). Lần đầu mất vài phút để dựng; các lần sau chỉ vài chục giây. Ứng dụng tự mở Docker Desktop nếu chưa chạy, cập nhật cấu trúc dữ liệu rồi mở TaskFlow thành **cửa sổ ứng dụng riêng** (Chrome ở chế độ app: không tab, không thanh địa chỉ).
2. Tùy chọn, để có **icon TaskFlow riêng trong Dock** (mặc định Dock hiện icon Chrome): mở `http://localhost:8765` trong Chrome thường, bấm biểu tượng cài đặt ở cuối thanh địa chỉ (hoặc menu ⋮ > Truyền, lưu và chia sẻ > Cài đặt trang dưới dạng ứng dụng). Từ lần sau `TaskFlow.app` sẽ mở ứng dụng đã cài đó.
3. Xong việc, bấm **Dừng TaskFlow**. Dữ liệu vẫn được giữ; hệ thống không tự chạy khi đăng nhập macOS.

Địa chỉ: `http://localhost:8765` (cổng 8765 chỉ mở trên máy bạn). Dữ liệu và cấu hình nằm ngoài repo, trong `~/Library/Application Support/TaskFlow/` (file `.env` riêng tư, thư mục `backups/`, nhật ký `taskflow.log`), tách hẳn khỏi bản phát triển.

Sau khi cài còn có lệnh `~/.local/bin/taskflow` (chạy từ bản đã cài, nên dùng được ở mọi terminal mà không cần quyền đọc `~/Documents`; thêm `export PATH="$HOME/.local/bin:$PATH"` vào `~/.zshrc` để gõ `taskflow ...`). Các lệnh dưới đây dùng được với cả `scripts/taskflow` lẫn `taskflow`.

| Lệnh | Việc |
|---|---|
| `scripts/taskflow status` / `start` / `stop` / `logs` | trạng thái, bật, dừng, xem nhật ký |
| `scripts/taskflow backup` | sao lưu ra `backups/*.sql.gz` (giữ 20 bản mới nhất, chỉ người dùng đọc được) |
| `scripts/taskflow restore <file> --yes` | khôi phục, **ghi đè** dữ liệu hiện tại |
| `scripts/taskflow update` | `git pull`, chép bản mới, sao lưu, dựng lại, chạy migration |
| `scripts/taskflow reset --yes` | xóa toàn bộ dữ liệu đã cài |
| `scripts/taskflow uninstall` | gỡ hai ứng dụng (giữ dữ liệu) |

Ghi chú: ứng dụng chạy từ một bản sao mã nguồn trong thư mục Application Support vì macOS không cho ứng dụng mở từ Finder đọc `~/Documents`. Vì vậy sau khi sửa mã, chạy `scripts/taskflow update` (hoặc `install`) để bản cài nhận thay đổi. Trang có manifest nên Chrome coi là ứng dụng cài được; không có service worker nên không bao giờ hiện dữ liệu cũ từ bộ nhớ đệm.

## Chạy test
```bash
cd backend && dotnet test TaskManagement.slnx    # cần Docker đang chạy
cd frontend && npm test -- --watch=false         # Vitest
```

## Tài liệu
- [Hướng dẫn sử dụng](docs/user-guide.md)
- [Triển khai và vận hành](docs/architecture/deployment.md), [kiến trúc](docs/architecture/overview.md), [ADR](docs/architecture/adr.md)
- [API](docs/api/api-spec.md) (Swagger tại `/swagger` khi chạy Development), [cơ sở dữ liệu](docs/database/schema.md)
- [Nghiệp vụ](docs/business-analysis/README.md), [quyết định yêu cầu](docs/requirements/decisions.md), [thiết kế UI](docs/ui-design/design-plan.md)
- [Checklist bàn giao](docs/delivery-checklist.md)
- [CLAUDE.md](CLAUDE.md): quy ước làm việc và các lỗi đã gặp
