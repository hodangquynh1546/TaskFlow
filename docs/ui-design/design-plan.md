> **Đã được thay thế bởi [design-plan-v2.md](design-plan-v2.md)** (giao diện "Tí và bảng dán", sáng/tối, Việt/English). Tài liệu này giữ làm lịch sử; wireframe chức năng và quy tắc nội dung vẫn đúng.

# UI Design Plan

Theo quy trình của skill `frontend-design` (lập kế hoạch → tự phản biện → mới code) và nguyên tắc của `modern-web-design` (a11y, token, skeleton, reduced-motion). Triển khai bằng Angular + NG-ZORRO. Ngôn ngữ giao diện: tiếng Việt.

## 1. Chủ đề, người dùng, nhiệm vụ chính

- **Sản phẩm:** TaskFlow, công cụ theo dõi công việc cá nhân.
- **Người dùng:** một người tự quản lý việc của mình, mở app nhiều lần mỗi ngày, thường chỉ vài chục giây mỗi lần.
- **Nhiệm vụ chính:** trả lời nhanh "việc nào cần xử lý bây giờ, và mình đang ở đâu so với tổng thể", rồi cập nhật trạng thái với ít thao tác nhất.
- **Từ vựng của chủ đề:** hạn chót, tiến độ, "gạch xong một việc". Ẩn dụ hình ảnh: một **bàn làm việc yên tĩnh**, thông tin sắp theo thời gian, hành động hoàn thành là khoảnh khắc thỏa mãn nhất.

## 2. Hệ token

### Màu (4 màu nền tảng + 3 màu ngữ nghĩa)

| Tên | Hex | Vai trò |
|---|---|---|
| Mist | `#EDF0EE` | Nền ứng dụng (xám lạnh hơi xanh, không phải kem) |
| Paper | `#FFFFFF` | Bề mặt nội dung, form |
| Ink | `#1E2B33` | Chữ chính (xanh than đậm) |
| Ink Soft | `#55646E` | Chữ phụ, meta |
| Pine | `#1F5E52` | Màu thương hiệu, nút chính, trạng thái Hoàn thành |
| Cobalt | `#2F5FA8` | Trạng thái Đang làm, liên kết |
| Slate | `#58656E` | Trạng thái Chưa làm |
| Vermilion | `#AE3622` | Quá hạn, ưu tiên Cao, lỗi, thao tác xóa |
| Ochre | `#8A5A00` | Sắp đến hạn, cảnh báo |

Phụ trợ: `Line #D5DBD8` (đường kẻ trang trí, không mang thông tin), `Edge #78858D` (viền ô nhập, 3.79:1 trên Paper đạt yêu cầu 3:1 cho thành phần UI), các nền nhạt `Pine/Cobalt/Slate/Vermilion/Ochre Tint` (`#E1EFEB`, `#E3EBF7`, `#E9EDEF`, `#F9E7E3`, `#F6EAD0`) cho tag.

**Tương phản đã tính (WCAG 2.x, script, không ước lượng):**

| Cặp | Tỉ lệ | Cặp | Tỉ lệ |
|---|---|---|---|
| Ink / Paper | 14.50 | Slate / Mist | 5.23 |
| Ink / Mist | 12.63 | Vermilion / Paper | 6.27 |
| Ink Soft / Mist | 5.33 | Vermilion / Mist | 5.46 |
| Pine / Paper | 7.55 | Ochre / Paper | 5.93 |
| Cobalt / Mist | 5.51 | Pine trên PineTint | 6.38 |
| Paper trên Pine (nút chính) | 7.55 | Vermilion trên VermTint | 5.24 |
| Slate trên SlateTint | 5.09 | Cobalt trên CobaltTint | 5.26 |

Mọi chữ đạt ≥ 4.5:1 (AA). Bản đầu của Slate và Vermilion không đạt trên Mist/tint nên đã làm đậm hơn. Phải chạy lại kiểm tra khi token thực tế được cài vào theme.

Màu **không bao giờ là tín hiệu duy nhất**: trạng thái luôn có biểu tượng + chữ; ưu tiên luôn có số vạch + chữ khi đọc bằng screen reader.

### Typography

| Vai trò | Font | Ghi chú |
|---|---|---|
| Tiêu đề, số liệu | **Bricolage Grotesque** 600/700 | Grotesque có cá tính, khác rõ với font thân |
| Thân bài, UI | **Be Vietnam Pro** 400/500/600 | Thiết kế riêng cho tiếng Việt, dấu rõ ở cỡ nhỏ |

- **Phải xác minh ở Phase 4:** Bricolage Grotesque có subset `vietnamese` đầy đủ dấu. Nếu không, dùng Be Vietnam Pro 600/700 cho cả tiêu đề.
- Cách nạp font: self-host (không gọi CDN lúc chạy) bằng `@fontsource`. Đây là package mới ngoài stack, **sẽ xin xác nhận ở Phase 4** trước khi cài.
- Thang cỡ chữ (tỉ lệ ≈ 1.2, rem với gốc 16px): caption 0.8125, small 0.875, body 1, h3 1.1875, h2 1.5, h1 1.875, display 2.5 (chỉ dùng ở Dashboard).
- Line-height: thân 1.55, tiêu đề 1.2. Độ rộng dòng mô tả ≤ 70 ký tự. Số liệu dùng `font-variant-numeric: tabular-nums`.
- Không dùng chữ viết hoa toàn bộ cho nhãn, không có nhãn phụ phía trên tiêu đề, không nhấn một từ trong tiêu đề.

### Khoảng cách, bo góc, độ nổi

- Đơn vị 4px; thang 4, 8, 12, 16, 24, 32, 48.
- **Ba mức bo góc có phân cấp:** điều khiển (nút, ô nhập) 6px; bề mặt (khối form, modal) 10px; tag 4px. Chỉ avatar tròn hoàn toàn.
- Không đổ bóng cho khối nội dung; bề mặt tách bằng khoảng trắng và đường kẻ `Line`. Chỉ lớp nổi (dropdown, modal, toast) có một mức bóng.

## 3. Ý tưởng bố cục

> Nội dung canh trái, đọc theo chiều thời gian. Điều duy nhất đáng nhớ là **thanh tiến độ phân đoạn** ở Dashboard; mọi thứ còn lại im lặng và kỷ luật.

**Thành phần đáng nhớ:** Dashboard mở bằng một thanh ngang chia đoạn theo tỉ lệ Chưa làm / Đang làm / Hoàn thành của toàn bộ công việc, kèm một câu nói rõ tình hình ("8 trong 12 việc đã xong") và, nếu có, một dòng quá hạn màu Vermilion liên kết tới danh sách đã lọc. Thanh này thay thế hàng ô số liệu quen thuộc. Thanh chạy một lần khi tải trang (khoảnh khắc chuyển động duy nhất không do người dùng gây ra).

### Khung ứng dụng

```
Desktop ≥ 1024                                         Mobile < 768
┌──────────┬──────────────────────────────────┐        ┌────────────────────────┐
│ TaskFlow │  Header 56px          [+ Tạo việc] [HA ▾]│  │ ☰  TaskFlow        [HA]│
│          ├──────────────────────────────────┤        ├────────────────────────┤
│ Tổng quan│                                  │        │  Nội dung (1 cột)      │
│▌Công việc│   Nội dung, rộng tối đa 1120px   │        │  hàng 2 dòng           │
│ Hồ sơ    │   canh trái                      │        │                        │
│          │                                  │        │                [+]     │
└──────────┴──────────────────────────────────┘        └────────────────────────┘
 Sidebar 232px, nền Mist, mục đang chọn:               Sidebar thành drawer; nút
 vạch Pine 3px bên trái + chữ đậm                      tạo việc thành nút nổi
 Tablet 768–1023: sidebar thu thành cột biểu tượng
```

### Dashboard

```
Tổng quan
Chào Nguyễn Văn A. Hôm nay còn 3 việc đến hạn.          ← câu thật từ dữ liệu, không khẩu hiệu

 8 / 12 việc đã hoàn thành
 [██████████████████████▒▒▒▒▒▒▒▒▒░░░░░░░░░]   ← Hoàn thành │ Đang làm │ Chưa làm
 ● Hoàn thành 8   ◐ Đang làm 2   ○ Chưa làm 2
 ⚠ 2 việc quá hạn  Xem                                   ← chỉ hiện khi overdue > 0

 Sắp đến hạn                          Mới cập nhật
 ─────────────────────────────        ─────────────────────────────
 ○ Nộp báo cáo quý      Mai 17:00     ◐ Viết kế hoạch       10 phút trước
 ○ Họp với khách        Thứ 5         ● Gửi hóa đơn         Hôm qua
 …                                    …
```
Hai danh sách đặt cạnh nhau từ 1024px, xếp dọc dưới đó; không bọc trong thẻ có bóng, chỉ tiêu đề + đường kẻ.

### Danh sách công việc

```
Công việc                                                    [+ Tạo công việc]
[🔍 Tìm theo tiêu đề   ] [Trạng thái ▾] [Ưu tiên ▾] [Hạn ▾] [Quá hạn ☐]  Xóa bộ lọc
Sắp xếp: [Ngày tạo ▾] [↓]
──────────────────────────────────────────────────────────────────────────────
 ◯  Nộp báo cáo quý                 ▮▮▮  Đang làm   Hạn mai 17:00      ⋯
    Báo cáo tài chính Q4 …
──────────────────────────────────────────────────────────────────────────────
 ✔  Gửi hóa đơn                     ▮▯▯  Hoàn thành  Hạn 10/11         ⋯
──────────────────────────────────────────────────────────────────────────────
                                          ‹ 1 2 3 › 10 / trang
```
- Vòng tròn bên trái: một chạm để đánh dấu hoàn thành hoặc mở lại (về Chưa làm). Đổi sang Đang làm qua menu `⋯` hoặc ở trang chi tiết.
- Ưu tiên: 1, 2 hoặc 3 vạch (Cao dùng Vermilion, còn lại Ink Soft), kèm `aria-label` đầy đủ.
- Hạn quá hạn: chữ Vermilion + biểu tượng; sắp đến hạn (≤ 48 giờ): Ochre.
- Mobile: mỗi hàng 2 dòng (tiêu đề / meta), bộ lọc nằm trong một nút "Bộ lọc" mở drawer.
- Bộ lọc ghi trên query string của URL.

### Tạo/Sửa công việc (một `TaskFormComponent` dùng chung)

```
← Công việc
Tạo công việc                        (Sửa: "Sửa công việc")
Tiêu đề *        [______________________________]   rộng tối đa 640px, một cột
Mô tả            [                              ]
Ưu tiên          ( ) Thấp  (•) Trung bình  ( ) Cao
Trạng thái       [Chưa làm ▾]
Bắt đầu          [dd/mm/yyyy  ]   Hạn hoàn thành [dd/mm/yyyy hh:mm]
                                  [Hủy]  [Tạo công việc]
```
Lỗi hiện ngay dưới ô, kèm tóm tắt phía trên nếu gửi thất bại. Nút chính giữ nguyên tên hành động ("Tạo công việc" / "Lưu thay đổi").

### Chi tiết công việc
Tiêu đề lớn, hàng meta (trạng thái có thể đổi tại chỗ, ưu tiên, hạn), mô tả, vùng ngày tạo / cập nhật ở cuối; hành động "Sửa" và "Xóa" (Vermilion, mở hộp thoại xác nhận nêu tên công việc).

### Đăng nhập / Đăng ký
Một cột 400px canh giữa trên nền Mist, tên "TaskFlow" làm wordmark chữ (không minh họa, không hero), form trong một bề mặt Paper, liên kết chuyển qua lại giữa hai trang. Có chỉ dẫn chính sách mật khẩu hiển thị trước khi nhập.

### Hồ sơ
Hai phần xếp dọc, ngăn bằng đường kẻ: "Thông tin tài khoản" (họ tên, email; ô mật khẩu hiện tại hiện ra chỉ khi email bị đổi) và "Đổi mật khẩu".

## 4. Nguyên tắc

1. Một điểm nhấn (thanh tiến độ); phần còn lại yên tĩnh.
2. Cấu trúc thị giác mang thông tin: vạch ưu tiên, biểu tượng trạng thái, màu hạn chót, không chỉ để trang trí.
3. Hàng có đường kẻ thay cho lưới thẻ; không đổ bóng khối nội dung.
4. Chuyển động có mục đích: thanh tiến độ chạy một lần khi tải; phản hồi khi hoàn thành một việc; mở/đóng hộp thoại. Không hiệu ứng vào trang cho từng khối, không nâng thẻ khi hover.
5. Chất lượng tối thiểu (không phô trương): responsive tới 360px, focus nhìn thấy (`:focus-visible` vòng Pine 2px lệch 2px), `prefers-reduced-motion` tắt mọi chuyển động trang trí, vùng chạm ≥ 44px trên mobile, ngữ nghĩa HTML (landmark, heading, `aria-live` cho thông báo).
6. Skeleton có hình dạng đúng của nội dung (hàng danh sách, thanh tiến độ), không dùng spinner toàn trang.

## 5. Từ vựng và nội dung

Cùng một khái niệm luôn một tên; hành động và thông báo dùng cùng động từ.

| Khái niệm | Hiển thị |
|---|---|
| Todo / InProgress / Completed | Chưa làm / Đang làm / Hoàn thành |
| Low / Medium / High | Thấp / Trung bình / Cao |
| Task | công việc (hoặc "việc" khi đếm) |

| Tình huống | Nội dung |
|---|---|
| Nút tạo | "Tạo công việc" → toast "Đã tạo công việc" |
| Nút lưu sửa | "Lưu thay đổi" → toast "Đã lưu thay đổi" |
| Xóa | Hộp thoại: "Xóa “{tên}”?" / "Công việc sẽ bị xóa vĩnh viễn." / nút "Xóa" và "Giữ lại" → toast "Đã xóa công việc" |
| Rỗng (chưa có việc) | "Chưa có công việc nào." + "Tạo công việc đầu tiên để bắt đầu theo dõi tiến độ." + nút "Tạo công việc" |
| Rỗng (lọc không khớp) | "Không có công việc khớp bộ lọc." + nút "Xóa bộ lọc" |
| Lỗi tải | "Không tải được danh sách công việc. Kiểm tra kết nối rồi thử lại." + nút "Thử lại" |
| 404 | "Không tìm thấy công việc này. Có thể nó đã bị xóa." + "Về danh sách" |
| Đăng nhập sai | "Email hoặc mật khẩu không đúng." |
| Lỗi chung 500 | "Có lỗi từ máy chủ. Thử lại sau ít phút. Mã tham chiếu: {traceId}" |
| Hết phiên (401) | Chuyển về đăng nhập kèm "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục." |

Lỗi không xin lỗi, nêu nguyên nhân và cách xử lý.

## 6. Triển khai với NG-ZORRO

- Tùy biến qua cơ chế theme/design token của NG-ZORRO (màu chủ đạo, bo góc, font), **không** ghi đè CSS lặp đi lặp lại. Cơ chế cụ thể phụ thuộc phiên bản đã cài; xác minh ở Phase 4.
- Dùng component có sẵn cho: form, input, select, date-picker, radio, modal (xác nhận), message/notification (toast), pagination, skeleton, drawer, dropdown. Hàng công việc là markup riêng (`nz-list` nếu phù hợp) thay vì `nz-table` để kiểm soát bố cục mobile.
- Biểu tượng: bộ `@ant-design/icons-angular` đi kèm NG-ZORRO, chỉ nạp các icon dùng tới.
- Component dùng chung dự kiến: `StatusIndicator`, `PriorityMarker`, `DueLabel`, `EmptyState`, `ErrorState`, `ProgressStrip`, `ConfirmDelete`.

## 6a. Kết quả triển khai Phase 4 (đã xem bằng trình duyệt thật)

- **Cơ chế theme:** biến Less, không phải CSS variable của NG-ZORRO (chỉ đổi được màu). `src/theme.less` là nguồn token duy nhất; xem ADR-14.
- **Font:** Bricolage Grotesque có subset `vietnamese` đầy đủ dấu (đã kiểm tra `document.fonts` và hiển thị thực tế). Chỉ nạp `latin` + `vietnamese`.
- **Đã phát hiện khi xem thật và sửa:**
  - Nút dạng liên kết (`<a nz-button>`) bị Ant Design đẩy chữ lên cao so với tâm; sửa một lần ở style toàn cục.
  - Thông báo lỗi form dính sát nhãn của ô kế tiếp; thêm khoảng đệm.
  - Wordmark "TaskFlow" bị cắt trong cột sidebar 72px ở tablet; dùng ký hiệu "TF".
  - Drawer mobile đóng vẫn để nút "Close" và link ngoài màn hình trong cây trợ năng; chuyển sang tạo theo yêu cầu qua `NzDrawerService`, đóng thì hủy hẳn. Esc đóng và trả focus về nút menu.
  - Khối tên/email trong menu tài khoản lệch 4px so với các mục menu.
- **Đã xác nhận:** vùng chạm ≥ 44px trên mobile (nút menu, tạo việc, tài khoản, mục điều hướng); màu lỗi và cảnh báo đúng token; trạng thái hết phiên hiển thị đúng văn bản đã thiết kế.
- **Chưa làm (thuộc Phase 5):** thanh tiến độ Dashboard, hàng công việc, form công việc, kiểm tra thị giác với dữ liệu thật (tiêu đề dài ở 360px, thanh tiến độ với dữ liệu cực đoan).

## 6b. Kết quả triển khai Phase 5 (đã xem bằng trình duyệt thật, dữ liệu thật)

- **Điểm nhấn Dashboard** đã thực hiện đúng ý: thanh tiến độ phân đoạn thay cho hàng ô số liệu, đoạn rộng theo tỷ lệ (kiểm tra 3 : 2 : 7 ứng với 3/12 xong), chú giải lặp lại từng con số bằng chữ. Con số lớn "3 / 12" dùng font tiêu đề.
- **Thay đổi so với wireframe:**
  - Hạn hoàn thành chọn theo ngày (không giờ); xem quyết định #44.
  - Danh sách: các cột phụ (ưu tiên, trạng thái, hạn) có độ rộng cố định để thẳng hàng giữa các hàng; không hiển thị "Chưa đặt hạn" trên từng hàng (việc không có hạn là bình thường); "Sắp xếp" đưa lên cùng dòng với ô tìm kiếm.
  - Trạng thái rỗng của người dùng mới không lặp lại câu "Chưa có công việc nào." ở hai chỗ.
- **Đã phát hiện khi xem thật và sửa:**
  - `<tf-progress-strip>` là phần tử inline nên thanh chỉ rộng ~60px; đặt `display: block`.
  - Danh sách yêu cầu mật khẩu dính sát nút gửi.
  - Chữ ở khối "Ngày bắt đầu" lớn hơn các khối khác trên trang chi tiết.
  - Dòng "Sắp xếp" chiếm ba dòng trên mobile.
- **Đã xác nhận:** không tràn ngang ở 390px, bộ lọc thu gọn sau nút "Bộ lọc", vùng chạm ≥ 40px; hộp thoại xóa đúng văn bản, "Giữ lại" ở trái và được focus trước; toast dùng cùng động từ với nút ("Tạo công việc" → "Đã tạo công việc", "Lưu thay đổi" → "Đã lưu thay đổi", "Xóa" → "Đã xóa công việc").

## 7. Tự phản biện (so với các mặc định hay gặp)

| Bản nháp đầu | Vì sao là mặc định | Đã đổi thành |
|---|---|---|
| Hàng 5 ô số liệu to kèm icon và gradient ở Dashboard | Chính là "số lớn + nhãn nhỏ + gradient" | Một thanh tiến độ phân đoạn + một câu; số liệu nằm trong chú giải |
| Mỗi công việc là một thẻ có bóng nhẹ | Bộ "SaaS-card" giống hệt nhau | Hàng có đường kẻ, không bóng |
| Trạng thái là pill màu viết hoa | Nhãn viết hoa, màu là tín hiệu duy nhất | Biểu tượng hình khác nhau + chữ thường; ưu tiên bằng số vạch |
| Một bo góc 8px cho mọi thứ | "Một bán kính cho tất cả" | Ba mức bo theo phân cấp |
| Sidebar xanh navy đậm, logo gradient | Chrome mẫu của dashboard | Sidebar cùng nền Mist, vạch Pine cho mục đang chọn, wordmark chữ |
| Nền kem + serif + màu đất nung | Tổ hợp hay gặp nhất của thiết kế sinh tự động | Nền xám lạnh hơi xanh, hai font sans khác tính cách, Vermilion chỉ dùng cho ý nghĩa (rủi ro) |
| Hiệu ứng fade-slide-up cho mỗi khối | Chuyển động mặc định | Chỉ một khoảnh khắc chuyển động khi tải + phản hồi hành động |

Rủi ro còn lại cần nhìn bằng mắt ở Phase 4 và 5 (chụp màn hình bằng Playwright): font Bricolage có đủ dấu tiếng Việt không; thanh tiến độ khi dữ liệu cực đoan (0 việc, toàn Hoàn thành, một đoạn rất nhỏ); độ dài tiêu đề dài trong hàng danh sách ở 360px.

## Lịch ngày (Phase 6)
- Trang `/schedule?date=YYYY-MM-DD`, mục "Lịch ngày" trong menu. Điều hướng ngày: nút trước/sau, ô chọn ngày, "Hôm nay".
- Trục giờ dọc, 06:00–22:00, mở rộng khi có việc ngoài khoảng; 1 giờ = 84px. Khối dùng màu theo trạng thái (Hoàn thành: gạch ngang tiêu đề), thanh trái theo ưu tiên; việc chồng giờ chia làn.
- Khối dưới 36px chuyển bố cục một dòng để tiêu đề không bị cắt; việc chưa có thời lượng vẽ 30 phút nét đứt.
- Cột phải: "Đến hạn trong ngày, chưa xếp giờ" và tổng thời gian đã xếp ("Đã xếp 2 giờ cho 1 việc"). Số liệu chỉ lấy từ dữ liệu thật.
- Form: giờ bắt đầu + nhóm nút thời lượng (Không đặt, 15 phút, 30 phút, 1/2/3/4 giờ, Khác) kèm gợi ý "Kết thúc lúc HH:mm"; lỗi vượt nửa đêm nêu cách sửa.
- Đã kiểm tra trình duyệt thật (tạo từ ô trống 09:00, lưu, khối 09:00–11:00 hiện đúng).
