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
