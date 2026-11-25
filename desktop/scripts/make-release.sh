#!/bin/bash
# Packs a signed TaskFlow.app into a disk image to hand to other people: release/TaskFlow-<version>-AppleSilicon.dmg, with the
# Applications shortcut for drag-and-drop and a short guide inside, plus the same guide next to it.
# Usage: scripts/make-release.sh /path/to/TaskFlow.app      (scripts/build.sh --release calls this)
set -euo pipefail

APP="${1:?Usage: make-release.sh /path/to/TaskFlow.app}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
OUT="$REPO/release"
VERSION="$(node -p "require('$HERE/package.json').version")"
DMG="$OUT/TaskFlow-${VERSION}-AppleSilicon.dmg"
GUIDE="$OUT/HUONG-DAN-CAI-DAT-MAC.txt"

[ -d "$APP" ] || { echo "Not found: $APP" >&2; exit 1; }
mkdir -p "$OUT"
rm -f "$DMG"

cat > "$GUIDE" <<GUIDE_END
TASKFLOW ${VERSION} - HƯỚNG DẪN CÀI ĐẶT (macOS)

TaskFlow là ứng dụng quản lý công việc cá nhân chạy ngay trên máy của bạn: không cần mạng, không cần tài khoản máy chủ.

1. YÊU CẦU
   - Mac dùng chip Apple (M1, M2, M3, M4...) và macOS 13 trở lên.
   - Không chạy trên Mac dùng chip Intel.
   - Còn trống khoảng 1 GB ổ đĩa.

2. CÀI ĐẶT
   a. Mở tệp TaskFlow-${VERSION}-AppleSilicon.dmg.
   b. Kéo biểu tượng TaskFlow vào thư mục Applications (Ứng dụng) trong cửa sổ vừa mở.
   c. Đóng cửa sổ và đẩy (eject) ổ đĩa TaskFlow.

3. LẦN MỞ ĐẦU TIÊN (quan trọng)
   Ứng dụng chưa được Apple "công chứng", nên macOS sẽ chặn ở lần mở đầu tiên với thông báo như
   "Không thể xác minh TaskFlow..." hoặc "TaskFlow bị hỏng". Đây là bình thường, chỉ cần làm MỘT lần:

   Cách 1 (không cần gõ lệnh):
     - Mở TaskFlow từ Applications (sẽ hiện thông báo chặn, bấm Xong/Done).
     - Vào Cài đặt Hệ thống (System Settings) > Quyền riêng tư & Bảo mật (Privacy & Security).
     - Kéo xuống mục Bảo mật, sẽ thấy dòng về TaskFlow, bấm "Vẫn mở" (Open Anyway), nhập mật khẩu Mac.
     - Mở lại TaskFlow và chọn "Mở" (Open).

   Cách 2 (nếu không thấy tùy chọn ở cách 1, hoặc báo "bị hỏng"):
     - Mở ứng dụng Terminal, dán lệnh sau rồi nhấn Enter:
           xattr -cr /Applications/TaskFlow.app
     - Mở lại TaskFlow.

   Lần đầu ứng dụng có thể hỏi quyền:
     - Thông báo: chọn "Cho phép" để được nhắc việc đúng giờ.
     - Chuỗi khóa (Keychain): chọn "Luôn cho phép" (Always Allow) để ứng dụng khởi động bình thường.

4. SỬ DỤNG
   - Đăng ký tài khoản trong ứng dụng (tài khoản chỉ nằm trên máy của bạn).
   - Nhắc việc: việc ưu tiên Trung bình nhắc trước 5 phút, ưu tiên Cao nhắc trước 15 phút.
   - Đóng cửa sổ không tắt ứng dụng: TaskFlow vẫn chạy ở thanh menu (góc trên bên phải màn hình) để nhắc việc.
     Muốn tắt hẳn: bấm Cmd+Q, hoặc biểu tượng TaskFlow ở thanh menu > Thoát.

5. DỮ LIỆU CỦA BẠN
   - Mỗi máy có dữ liệu riêng, không tự động đồng bộ giữa các máy.
   - Dữ liệu nằm ở: ~/Library/Application Support/TaskFlow Desktop
     (trong Finder: Đi > Đi tới thư mục / Go > Go to Folder, dán đường dẫn trên).
     Cập nhật hoặc xóa ứng dụng KHÔNG xóa thư mục này.
   - Sao lưu hoặc chuyển sang máy khác: vào Hồ sơ > Xuất dữ liệu (JSON hoặc CSV), trên máy mới vào Hồ sơ > Nhập dữ liệu.

6. CẬP NHẬT BẢN MỚI
   Mở tệp .dmg mới và kéo TaskFlow vào Applications, chọn "Thay thế" (Replace). Dữ liệu được giữ nguyên.

7. GỠ CÀI ĐẶT
   Thoát TaskFlow, kéo TaskFlow từ Applications vào thùng rác. Muốn xóa cả dữ liệu thì xóa thêm thư mục ở mục 5.
GUIDE_END

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ditto --noextattr --norsrc "$APP" "$STAGE/TaskFlow.app"
ln -s /Applications "$STAGE/Applications"
cp "$GUIDE" "$STAGE/HUONG-DAN-CAI-DAT.txt"

echo "Creating $DMG"
hdiutil create -volname "TaskFlow" -srcfolder "$STAGE" -format UDZO -imagekey zlib-level=9 -ov "$DMG" >/dev/null
hdiutil verify "$DMG" >/dev/null && echo "disk image ok"

# The app inside must still carry a valid signature after being copied into the image.
MOUNT="$(mktemp -d)"
hdiutil attach "$DMG" -readonly -nobrowse -noverify -mountpoint "$MOUNT" >/dev/null
trap 'hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; rm -rf "$STAGE" "$MOUNT"' EXIT
codesign --verify --deep --strict "$MOUNT/TaskFlow.app" && echo "signature inside the image ok"

du -sh "$DMG" | awk '{print "Release: " $1}'
shasum -a 256 "$DMG"
