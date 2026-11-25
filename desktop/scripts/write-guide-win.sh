#!/bin/bash
# Writes the installation guide that goes with the Windows installer. Usage: write-guide-win.sh <file> <version>
set -euo pipefail
FILE="${1:?file}"
VERSION="${2:?version}"
cat > "$FILE" <<GUIDE_END
TASKFLOW ${VERSION} - HƯỚNG DẪN CÀI ĐẶT (Windows)

TaskFlow là ứng dụng quản lý công việc cá nhân chạy ngay trên máy của bạn: không cần mạng, không cần tài khoản máy chủ.

1. YÊU CẦU
   - Windows 10 hoặc Windows 11, bản 64-bit (máy tính thông thường đều là 64-bit).
   - Còn trống khoảng 1 GB ổ đĩa.
   - Không cần quyền quản trị: ứng dụng cài riêng cho tài khoản của bạn.

2. CÀI ĐẶT
   a. Nhấn đúp tệp TaskFlow-Setup-${VERSION}-x64.exe.
   b. Windows có thể hiện cửa sổ xanh "Windows protected your PC" (Windows đã bảo vệ PC của bạn).
      Đây là bình thường vì ứng dụng chưa được ký số (cần chứng chỉ trả phí). Chỉ cần làm như sau:
        - Bấm "More info" (Thông tin khác).
        - Bấm "Run anyway" (Vẫn chạy).
      Nếu trình duyệt hoặc ứng dụng chat báo tệp "không an toàn", hãy chọn giữ lại / tải về vẫn giữ.
      Nếu phần mềm diệt virus chặn, hãy chỉ cho phép khi bạn tin người gửi tệp.
   c. Làm theo các bước của trình cài đặt (chọn thư mục, bấm Install). Cài xong chọn "Run TaskFlow".
   Trên màn hình nền và trong menu Start sẽ có biểu tượng TaskFlow.

3. SỬ DỤNG
   - Lần đầu mở ứng dụng khởi động trong vài giây (chuẩn bị cơ sở dữ liệu riêng trên máy bạn). Hãy chờ cửa sổ hiện ra.
   - Đăng ký tài khoản trong ứng dụng (tài khoản chỉ nằm trên máy của bạn).
   - Nhắc việc: việc ưu tiên Trung bình nhắc trước 5 phút, ưu tiên Cao nhắc trước 15 phút. Nếu Windows đang bật
     "Không làm phiền" / "Focus assist" thì thông báo có thể bị ẩn.
   - Đóng cửa sổ không tắt ứng dụng: TaskFlow vẫn chạy ở khay hệ thống (góc dưới bên phải, có thể nằm sau mũi tên ^)
     để nhắc việc. Bấm vào biểu tượng để mở lại. Muốn tắt hẳn: bấm chuột phải vào biểu tượng > Thoát.
   - Tường lửa Windows (Firewall) có thể không hỏi gì: ứng dụng chỉ làm việc trong nội bộ máy bạn, không mở cổng ra mạng.

4. DỮ LIỆU CỦA BẠN
   - Mỗi máy có dữ liệu riêng, không tự động đồng bộ giữa các máy.
   - Dữ liệu nằm ở: %APPDATA%\\TaskFlow Desktop
     (dán đường dẫn đó vào thanh địa chỉ của File Explorer). Cập nhật hoặc gỡ ứng dụng KHÔNG xóa thư mục này.
     Nếu tên tài khoản Windows của bạn có chữ có dấu, dữ liệu nằm ở C:\\ProgramData\\TaskFlow\\<mã gồm 10 ký tự>
     (cơ sở dữ liệu làm việc ổn định hơn với đường dẫn chỉ gồm chữ không dấu).
   - Sao lưu hoặc chuyển sang máy khác: vào Hồ sơ > Xuất dữ liệu (JSON hoặc CSV); trên máy mới vào Hồ sơ > Nhập dữ liệu.

5. CẬP NHẬT BẢN MỚI
   Chạy tệp cài đặt mới, nó sẽ thay thế bản cũ. Dữ liệu được giữ nguyên.

6. GỠ CÀI ĐẶT
   Cài đặt (Settings) > Ứng dụng (Apps) > TaskFlow > Gỡ cài đặt (Uninstall). Muốn xóa cả dữ liệu thì xóa thêm thư mục ở mục 4.

7. NẾU ỨNG DỤNG KHÔNG MỞ
   - Thoát TaskFlow ở khay hệ thống rồi mở lại.
   - Nếu hiện thông báo lỗi, bấm "Open logs" (Mở nhật ký) và gửi cho người đã đưa bạn ứng dụng các tệp trong thư mục logs.
GUIDE_END
