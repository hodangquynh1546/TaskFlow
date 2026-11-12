# Checklist bàn giao

Kiểm tra ngày 2026-11-12.

## Chất lượng
- [x] `dotnet build TaskManagement.slnx`: 0 cảnh báo, 0 lỗi (warnings-as-errors)
- [x] Unit test Backend: 152 đạt
- [x] Integration test Backend (PostgreSQL thật qua Testcontainers): 320 đạt, gồm cô lập dữ liệu hai user, filter/sort/phân trang, biên thời lượng
- [x] Test Frontend (Vitest): 713 đạt, gồm test provider thật (`app.config.spec.ts`) và routing đầu-cuối
- [x] `npm run build`: thành công (cảnh báo ngân sách bundle khởi tạo 1,11 MB, ngưỡng lỗi 1,5 MB)
- [x] Kiểm tra trình duyệt thật với Backend thật cho các luồng chính và Lịch ngày

## Giao diện v2
- [x] Việt/English, sáng/tối, chuyển động; kiểm bằng ảnh chụp trên Chromium thật (desktop sáng, tối + English, điện thoại), console không lỗi
- [x] Thông báo lỗi Backend theo `Accept-Language` (ADR-18), có test bắt buộc mọi thông báo mới phải có bản dịch
- [x] Tương phản WCAG AA: mọi cặp chữ/nền chính ≥ 5:1 ở cả sáng và tối (xem design-plan-v2.md)
- [x] Kiểm thử đột biến: i18n (nhận diện ngôn ngữ, số nhiều), theme, quy tắc nửa đêm, ranh giới quá hạn, header ngôn ngữ, thời lượng ở Backend: tất cả đột biến bị bắt

## Bảo mật
- [x] Không có secret trong source; `.env` bị gitignore, `.env.example` chỉ có giá trị mẫu
- [x] API không khởi động nếu thiếu connection string hoặc `Jwt:Key` < 32 byte
- [x] Mọi truy vấn task lọc theo user từ JWT; task người khác trả 404 (integration test hai user)
- [x] Không trả `PasswordHash`; đăng nhập sai không lộ email nào tồn tại
- [x] Giới hạn 10 lần/phút/IP cho login và register
- [x] `npm audit --omit=dev`: 0 lỗ hổng; `dotnet list package --vulnerable`: 0

## Tài liệu
- [x] README (chạy nhanh), hướng dẫn sử dụng, triển khai, kiến trúc, ADR, API, schema, nghiệp vụ, quyết định, thiết kế UI
- [x] CLAUDE.md có lệnh thường dùng và các lỗi đã gặp

## Việc cần chủ dự án quyết định hoặc làm tiếp
- [ ] Git: repo chưa có commit nào (theo quy ước không tự commit); bạn tự commit và thêm remote
- [x] Forwarded headers (ADR-16) và Dockerfile, nginx, compose profile `app`: đã làm và chạy thử
- [ ] TLS: đã có hướng dẫn Caddy ([deployment.md](architecture/deployment.md)), chưa có cấu hình sẵn trong repo (cần bạn duyệt nếu muốn thêm container Caddy); CI: chưa làm
- [x] Stack Docker chạy trên Chromium thật (headless): đăng nhập, Tổng quan, Công việc, Lịch ngày, Hồ sơ đều mở được, console không có lỗi CSP hay lỗi nào khác
- [ ] Dữ liệu demo trong DB dev (phase4.demo, phase5.mai, phase6.khoa): xóa bằng `docker compose down -v` nếu muốn DB sạch
- [ ] Quy tắc khối giờ không qua nửa đêm chỉ kiểm ở Frontend: cân nhắc có chấp nhận
- [ ] Dọn Node 25 hỏng của Homebrew: `brew uninstall node`

## Gợi ý chia commit (bạn tự thực hiện; repo chưa có commit nào)
1. `chore: repo scaffolding` — `.gitignore`, `.env.example`, `docker-compose.yml`, `CLAUDE.md`, `README.md`, `.claude/`
2. `docs: requirements, analysis, architecture, database, api, ui design` — `docs/`
3. `feat(backend): domain, application, infrastructure, api` — `backend/src`
4. `test(backend): unit and integration tests` — `backend/tests`
5. `feat(frontend): angular app` — `frontend/` (không gồm `node_modules`, `dist`, `.angular`, đã được ignore)
6. `build: docker images and nginx` — `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf` (có thể gộp vào 3 và 5)
Kiểm trước khi commit: `git status` không có `.env`; `git ls-files --others --exclude-standard | wc -l` khoảng 290 file.
