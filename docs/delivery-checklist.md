# Checklist bàn giao

Kiểm tra ngày 2026-11-12.

## Chất lượng
- [x] `dotnet build TaskManagement.slnx`: 0 cảnh báo, 0 lỗi (warnings-as-errors)
- [x] Unit test Backend: 152 đạt
- [x] Integration test Backend (PostgreSQL thật qua Testcontainers): 320 đạt, gồm cô lập dữ liệu hai user, filter/sort/phân trang, biên thời lượng
- [x] Test Frontend (Vitest): 713 đạt, gồm test provider thật (`app.config.spec.ts`) và routing đầu-cuối
- [x] `npm run build`: thành công (cảnh báo ngân sách bundle khởi tạo 1,11 MB, ngưỡng lỗi 1,5 MB)
- [x] Kiểm tra trình duyệt thật với Backend thật cho các luồng chính và Lịch ngày

## Báo cáo và đa ngôn ngữ (ja, zh)
- [x] `GET /api/dashboard/report` (tuần/tháng/năm, múi giờ của người dùng) và 11 test tích hợp
- [x] Báo cáo ở Tổng quan: hai biểu đồ cột, trung bình ngày/tuần/tháng, bảng số liệu cho trình đọc màn hình
- [x] Tiếng Nhật và tiếng Trung giản thể: giao diện, thông báo lỗi Backend, lịch NG-ZORRO, phông CJK dự phòng; test bắt buộc đủ khóa và không còn chữ Việt/Anh
- [ ] Bản dịch ja/zh do Claude viết, chưa có người bản ngữ rà soát
- [ ] Chưa xem bằng trình duyệt thật: bố cục báo cáo trên điện thoại, chế độ tối, chữ CJK trong ô chọn ngày

## Ở lại đăng nhập, danh sách việc, sửa lỗi giao diện
- [x] Refresh token xoay vòng (ADR-20): 17 test tích hợp (xoay, hết hạn, phát hiện dùng lại, đăng xuất, đổi mật khẩu, xóa tài khoản) và test interceptor; đã thử trên bản thật với access token hết hạn: tải lại vẫn ở đúng trang
- [x] Ứng dụng Mac vẫn còn đăng nhập sau khi thoát (Cmd+Q) và mở lại: lỗi do cổng API ngẫu nhiên mỗi lần chạy (đăng nhập lưu theo địa chỉ); đã cố định cổng và kiểm bằng cách mở, thoát, mở lại hai lần
- [x] Điện thoại: thanh tab dưới không còn bị trang đang chuyển che khuất khi đổi mục (lỗi View Transitions)
- [x] Tạo việc xong thì mở danh sách Công việc đúng trang chứa việc mới, cuộn tới và nháy sáng (`GET /api/tasks/{id}/position`); giữ sắp xếp và bộ lọc của danh sách trước đó, bộ lọc nào ẩn mất việc mới thì bỏ; Hủy quay về trang trước
- [x] Hạn hoàn thành không còn nhập tay: máy chủ tự tính từ giờ bắt đầu + thời lượng (11 test), form bỏ ô hạn và hiện "Kết thúc và đến hạn lúc …"; gợi ý tiêu đề theo tiền tố từ các tiêu đề đã dùng (9 test tích hợp, kiểm "đ" ra đã dạy/động/đen, "đã" chỉ còn đã dạy); khung giờ trong danh sách có màu theo trạng thái
- [ ] Mục "Đến hạn trong ngày, chưa xếp giờ" ở Lịch ngày hầu như luôn trống vì việc mới có hạn thì luôn có giờ bắt đầu; chưa gỡ, chờ quyết định
- [x] Khung ứng dụng vừa khít cửa sổ: menu trái, thanh tiêu đề (avatar) cố định, trang không cuộn; chỉ vùng `.content` (hoặc vùng cuộn riêng của từng trang) cuộn, nên macOS nảy khi cuộn quá đầu/cuối không còn kéo menu theo; Tổng quan cũng cố định tiêu đề; đổi màn hình thì nội dung về đầu trang
- [x] Lưu việc (tạo hoặc sửa) quay về đúng nơi đang duyệt, kể cả khi đi qua trang chi tiết: từ Lịch ngày thì về Lịch ngày, đúng ngày việc bắt đầu, cuộn tới và nháy khối của việc; từ danh sách thì về danh sách với đúng bộ lọc và sắp xếp (bộ lọc luôn được giữ, nếu nó ẩn mất việc thì báo lý do); từ Tổng quan hoặc Hồ sơ thì về danh sách Công việc không lọc (`BrowseMemory`)
- [x] Danh sách Công việc là hai hộp: bộ lọc (và tiêu đề) đứng yên, hộp danh sách có dòng đếm và phân trang cố định, chỉ các thẻ cuộn bên trong; hai thẻ mỗi hàng từ 1100 px, một thẻ mỗi hàng ở màn nhỏ (theo thứ tự đọc)
- [x] Trang tạo và sửa việc: nút quay lại và tiêu đề cố định, khung form (viền, bóng, nút Hủy/Lưu) đứng yên, chỉ các ô cuộn bên trong khung; trang không cuộn, kể cả trên điện thoại; lưu việc đã sửa thì về danh sách đúng vị trí của nó
- [x] Lịch ngày hôm nay mở với giờ hiện tại ở dòng đầu; danh sách việc bỏ biểu tượng mức ưu tiên
- [x] Việc hoàn thành luôn xuống cuối danh sách, kể cả khi phân trang
- [x] Biểu đồ năm: backend trả `"Year"` nhưng giao diện so với `'year'` nên nhãn tháng bị sai; đã sửa và nhãn dài ("Tháng 11") rút thành "T11"
- [x] Menu thao tác ở hàng việc mở lên trên khi gần thanh tab dưới (điện thoại)
- [ ] Chưa kiểm menu của các ô chọn khác (lọc, chọn ngày) khi sát thanh tab dưới
- [ ] Mỗi lần dựng lại ứng dụng Mac, macOS hỏi lại quyền Keychain ("TaskFlow Safe Storage"): chọn Luôn cho phép

## Ứng dụng Mac độc lập (Electron)
- [x] Backend: lệnh `migrate`, chế độ phục vụ Angular (`Hosting:ServeSpa`), 15 test
- [x] `desktop/`: 42 test đơn vị (vòng đời, sao lưu/khôi phục, dọn tiến trình cũ)
- [x] Chạy thật gói đã build: PostgreSQL nhúng khởi động, đăng ký/đăng nhập/tạo việc, tìm chữ Việt không phân biệt hoa thường trên `en_US.UTF-8`
- [x] Thoát bình thường dưới 1 giây, không còn tiến trình; dữ liệu còn sau khi mở lại
- [x] Bị buộc dừng (`kill -9`): lần mở sau dọn PostgreSQL và API cũ
- [ ] Chưa thử bằng tay: menu Sao lưu/Khôi phục trong cửa sổ thật, cửa sổ ở chế độ tối/English
- [ ] Chưa ký Developer ID/notarize (chỉ dùng trên máy build)

## Cài trên Mac (PWA + TaskFlow.app, phương án Docker cũ)
- [x] `scripts/taskflow`: install, start, stop, status, backup, restore, update, reset, uninstall; thử đủ vòng đời trong project riêng rồi dọn
- [x] Chrome: manifest đọc được, 0 lỗi installability (CDP `Page.getInstallabilityErrors`)
- [x] Mở bằng `TaskFlow.app` thật: tự bật stack, DB mới sạch; `Dừng TaskFlow.app` dừng và giữ dữ liệu
- [x] `TaskFlow.app` mở cửa sổ ứng dụng riêng (Chrome app mode), không phải tab web
- [ ] Tùy chọn: bạn cài PWA từ Chrome nếu muốn icon TaskFlow riêng trong Dock (tôi không thao tác được giao diện Chrome của bạn)
- [ ] Thử sao lưu định kỳ: `scripts/taskflow backup` chưa được lên lịch tự động

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
