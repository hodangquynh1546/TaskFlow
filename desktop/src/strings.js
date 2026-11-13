'use strict';

const MESSAGES = {
  vi: {
    starting: 'Đang khởi động TaskFlow…',
    backingUp: 'Đang sao lưu dữ liệu…',
    restoring: 'Đang khôi phục dữ liệu…',
    startFailedTitle: 'TaskFlow không khởi động được',
    startFailedBody: 'Chi tiết đã được ghi vào nhật ký. Bạn có thể mở thư mục nhật ký để xem.',
    openLogs: 'Mở thư mục nhật ký',
    quit: 'Thoát',
    menuAbout: 'Về TaskFlow',
    menuHide: 'Ẩn TaskFlow',
    menuQuit: 'Thoát TaskFlow',
    menuFile: 'Tệp',
    menuBackup: 'Sao lưu dữ liệu…',
    menuRestore: 'Khôi phục từ bản sao lưu…',
    menuOpenData: 'Mở thư mục dữ liệu',
    menuOpenLogs: 'Mở thư mục nhật ký',
    menuEdit: 'Chỉnh sửa',
    menuView: 'Hiển thị',
    menuWindow: 'Cửa sổ',
    backupDone: 'Đã sao lưu',
    backupSaved: 'Bản sao lưu đã được lưu tại:',
    restoreConfirmTitle: 'Khôi phục dữ liệu?',
    restoreConfirmBody: 'Toàn bộ dữ liệu hiện tại sẽ được thay bằng bản sao lưu. Dữ liệu hiện tại được giữ lại cạnh đó (pgdata.before-restore-…) phòng khi bạn đổi ý.',
    restoreConfirmOk: 'Khôi phục',
    cancel: 'Hủy',
    restoreDone: 'Đã khôi phục dữ liệu',
    failed: 'Không thực hiện được',
    backupFilter: 'Bản sao lưu TaskFlow',
  },
  en: {
    starting: 'Starting TaskFlow…',
    backingUp: 'Backing up your data…',
    restoring: 'Restoring your data…',
    startFailedTitle: 'TaskFlow could not start',
    startFailedBody: 'Details were written to the log. You can open the log folder to see them.',
    openLogs: 'Open log folder',
    quit: 'Quit',
    menuAbout: 'About TaskFlow',
    menuHide: 'Hide TaskFlow',
    menuQuit: 'Quit TaskFlow',
    menuFile: 'File',
    menuBackup: 'Back up data…',
    menuRestore: 'Restore from backup…',
    menuOpenData: 'Open data folder',
    menuOpenLogs: 'Open log folder',
    menuEdit: 'Edit',
    menuView: 'View',
    menuWindow: 'Window',
    backupDone: 'Backup complete',
    backupSaved: 'The backup was saved to:',
    restoreConfirmTitle: 'Restore data?',
    restoreConfirmBody: 'All current data will be replaced by the backup. The current data is kept next to it (pgdata.before-restore-…) in case you change your mind.',
    restoreConfirmOk: 'Restore',
    cancel: 'Cancel',
    restoreDone: 'Data restored',
    failed: 'That did not work',
    backupFilter: 'TaskFlow backup',
  },
};

/** Vietnamese for Vietnamese systems, English for everything else (like the web app's first-visit rule). */
function languageFor(locale) {
  return String(locale ?? '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

function translator(locale) {
  const table = MESSAGES[languageFor(locale)];
  return (key) => table[key] ?? MESSAGES.en[key] ?? key;
}

module.exports = { MESSAGES, languageFor, translator };
