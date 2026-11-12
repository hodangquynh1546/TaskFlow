# Thiết kế lại giao diện (v2): "Tí và bảng dán"

Thay thế bảng màu và phong cách của [design-plan.md](design-plan.md) (bản v1 giữ làm lịch sử; các quy tắc nội dung, chất lượng tối thiểu và wireframe chức năng vẫn áp dụng). Yêu cầu: đẹp, vui nhộn, nhiều chuyển động, đa ngôn ngữ (Việt/English). Mức chuyển động đã chọn: "rất sống động".

## Ý tưởng
Công việc là những **miếng dán trên bảng kế hoạch**. Mỗi việc là một miếng dán có viền mực đậm và bóng đổ cứng (không mờ), màu theo trạng thái. Một nhân vật nhỏ tên **Tí** (giọt nước có mắt, vẽ bằng SVG) là "người bạn" của người dùng, chỉ xuất hiện ở 4 nơi: lời chào ở Tổng quan, trạng thái trống, ăn mừng khi hoàn thành, và trang 404.

## Bảng màu (token ở `theme.less`)
| Tên | Hex | Vai trò |
|---|---|---|
| Mực (Ink) | `#1F1B4D` | Chữ, viền, bóng đổ cứng |
| Nền (Canvas) | `#F1F6FF` | Nền trang (xanh lơ rất nhạt, không phải kem) |
| Giấy (Paper) | `#FFFFFF` | Mặt miếng dán, form |
| Cam (Tangerine) | `#FF8A3D` | Hành động chính (chữ mực trên nền cam, tương phản ≈ 6:1) |
| Trời (Sky) | `#7DB8FF` | Trạng thái Chưa làm |
| Chanh (Lemon) | `#FFD84A` | Trạng thái Đang làm |
| Bạc hà (Mint) | `#5FE0A4` | Trạng thái Hoàn thành |
| Kẹo (Bubblegum) | `#FF7AAE` | Ưu tiên Cao, quá hạn, lỗi |

Màu chỉ mã hóa trạng thái/ưu tiên; diện tích lớn luôn là Canvas và Paper. Mọi chữ trên nền màu dùng Mực (đã tính tương phản ≥ 4.5:1). Màu nhạt của từng trạng thái (tint) dùng làm nền phụ.

## Chữ
- Tiêu đề và số lớn: **Baloo 2** 700/800 (tròn, vui, có glyph tiếng Việt đầy đủ).
- Nội dung: **Be Vietnam Pro** 400/500/600 (giữ từ v1: đọc tốt, dấu tiếng Việt rõ).
- Thang chữ: 13 / 15 / 17 / 22 / 30 / 44 (số lớn). Độ dài dòng ≤ 70 ký tự.

## Hình khối
- Miếng dán: viền 2px Mực, bóng cứng `3px 3px 0 Mực`, bo 14px. Bấm: miếng dán lún xuống (bóng thu về 0).
- Nút/chip: bo tròn hoàn toàn (pill). Panel lớn (form, lịch): bo 22px, viền 2px, bóng cứng nhỏ hơn. Ô nhập: bo 10px, viền 2px.
- Bố cục: thanh bên trái (miếng dán điều hướng) trên desktop; **thanh tab dưới** trên điện thoại (thay ngăn kéo). Tổng quan dạng bento không đối xứng, không lưới thẻ đồng nhất.

## Chuyển động (mỗi cái có lý do)
| Khoảnh khắc | Chuyển động | Lý do |
|---|---|---|
| Vào Tổng quan | Tí vẫy tay, các miếng dán nảy vào lần lượt, số đếm tăng dần | Một màn chào duy nhất, đo bằng số thật |
| Chuyển trang | Cross-fade + trượt 8px (View Transitions) | Cho biết đã đổi trang |
| Bấm nút/miếng dán | Lún xuống, nhả ra nảy nhẹ | Phản hồi thao tác |
| Hoàn thành việc | Ô tích nảy, bắn confetti, Tí nhảy mừng, toast | Phần thưởng cho hành động chính |
| Lịch ngày | Khối rơi vào theo làn, lướt theo hướng đổi ngày | Cho thấy ngày đang chuyển trái hay phải |
| Trạng thái trống, 404 | Tí thở, chớp mắt, lắc đầu | Mời thao tác thay vì để trang chết |
| Đổi ngôn ngữ | Chữ chuyển mờ nhanh | Tránh nhảy giật |
| Tải dữ liệu | Skeleton có ánh sáng quét | Giữ chỗ, tránh dịch bố cục |

Không có hiệu ứng cuộn rải đều lên mọi section, không con trỏ tùy biến, không chuyển động lặp vô hạn ngoài Tí ở trạng thái trống. `prefers-reduced-motion: reduce` tắt hết chuyển động (giữ nguyên nội dung và trạng thái). Thực hiện bằng CSS keyframes, View Transitions API và `requestAnimationFrame` (đếm số, confetti canvas); **không thêm thư viện chuyển động** (không GSAP/Lottie/confetti).

## Đa ngôn ngữ
Dịch vụ i18n tự viết dựa trên signals (không thêm package): từ điển `vi` và `en`, khóa có kiểu, tham số `{n}`, số nhiều qua `Intl.PluralRules`, ngày giờ qua `Intl.DateTimeFormat`, đổi ngôn ngữ tức thì không tải lại trang, lưu lựa chọn, mặc định theo trình duyệt. Locale của NG-ZORRO đổi theo. Test bắt buộc: hai từ điển cùng bộ khóa và cùng tham số. Hạn chế đã biết: thông báo lỗi do **Backend** trả về (tiếng Việt) chưa được dịch; xem phần "Việc tiếp theo" trong báo cáo.

## Chế độ sáng/tối
Ba lựa chọn: **Sáng**, **Tối**, **Theo hệ thống** (mặc định), đặt trong menu tài khoản và trên trang đăng nhập; lưu ở trình duyệt, áp dụng ngay không tải lại.
- Cơ chế: thuộc tính `data-theme` trên `<html>` + token CSS (`--tf-*`) đổi giá trị theo chế độ. Đặt thuộc tính trước khi Angular hiển thị (trong `main.ts`, không dùng script inline vì CSP cấm) để tránh nháy sáng.
- Bảng màu tối: Nền `#14122E`, Giấy `#201C4A`, chữ/viền `#F1F0FF`, các màu trạng thái giữ nguyên. Chữ trên nền màu luôn dùng Mực đậm `#1F1B4D` (token `--tf-on-color`, không đổi theo chế độ) nên tương phản không đổi. Bóng cứng trong chế độ tối là đen `#000` (viền sáng giữ phong cách miếng dán).
- NG-ZORRO được biên dịch bằng Less nên không đổi màu lúc chạy; phần tối của các component đang dùng (ô nhập, select, date picker, modal, dropdown, phân trang, radio, checkbox, toast) viết bằng ghi đè theo token ở một file duy nhất `styles/dark-overrides.scss`.
- Khoảnh khắc chuyển động thêm: đổi chế độ chuyển màu mượt 250ms (tắt khi giảm chuyển động).

## Tương phản (đo bằng công thức WCAG)
| Cặp | Sáng | Tối |
|---|---|---|
| Chữ chính trên Giấy / Nền | 15,9 / 14,7 | 14,1 / 16,1 |
| Chữ phụ trên Giấy / Nền | 7,1 / 6,6 | 8,2 / 9,4 |
| Liên kết trên Giấy | 5,9 | 8,1 |
| Mực trên Cam / Trời / Chanh / Bạc hà / Kẹo | 6,8 / 7,7 / 11,5 / 9,6 / 6,5 | như sáng (token `--tf-on-color` không đổi) |
| Chữ phụ trên các nền nhạt (tint) | 5,95 đến 6,4 | 5,0 đến 5,8 |
Tất cả ≥ 4,5:1. Viền Mực/viền sáng trên Giấy ≥ 14:1.

## Tự phản biện so với mặc định "AI-generated"
- "Kẹo nhiều màu = app trẻ con/mẫu": giảm bằng cách giữ nền trung tính, màu chỉ để mã hóa dữ liệu, viền Mực thống nhất làm "keo" cho mọi thứ. Đã bỏ ý tưởng nền gradient và blob trang trí.
- "Thẻ giống hệt nhau": Tổng quan dùng bento kích thước khác nhau, danh sách việc là hàng miếng dán, lịch là khối theo thời lượng; bo góc và bóng thay đổi theo vai trò.
- "Nhãn VIẾT HOA phía trên mọi tiêu đề, chuỗi A · B · C, mũi tên → sau link": không dùng.
- "Chuyển động lan tràn": chỉ 8 khoảnh khắc ở bảng trên; mọi thứ khác tĩnh.
- Nhân vật là điểm nhớ duy nhất; không thêm minh họa khác.

## Phạm vi và thứ tự thực hiện
1. Nền móng: token/theme (sáng + tối), font, i18n, tiện ích chuyển động (đếm số, confetti), Tí.
2. Khung ứng dụng, đăng nhập/đăng ký, Tổng quan.
3. Danh sách, form, chi tiết công việc.
4. Lịch ngày, Hồ sơ, 404.
5. Cập nhật test, kiểm tra trình duyệt thật (ảnh chụp), tài liệu.
