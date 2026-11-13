# Triển khai và vận hành

## Thành phần
| Thành phần | Chạy bằng | Ghi chú |
|---|---|---|
| PostgreSQL 16 | `docker compose up -d --wait` (dev) hoặc dịch vụ DB của bạn | Dev chỉ lắng nghe `127.0.0.1` |
| Backend | `dotnet run` (dev) hoặc `dotnet publish -c Release` | Cổng dev 5095 |
| Frontend | `npm start` (dev) hoặc `npm run build` → `frontend/dist/taskflow/browser` | Là file tĩnh |

## Biến môi trường Backend
| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `ConnectionStrings__DefaultConnection` | có | Chuỗi kết nối Npgsql. Thiếu thì API không khởi động |
| `Jwt__Key` | có | Khóa ký, ≥ 32 byte (`openssl rand -base64 48`). Thiếu hoặc ngắn thì API không khởi động |
| `Jwt__Issuer`, `Jwt__Audience` | không | Mặc định `TaskFlow`, `TaskFlow.Client` |
| `Jwt__ExpiresMinutes` | không | Mặc định 60 |
| `RateLimiting__AuthPermitPerMinute` | không | Số lần login/register mỗi phút mỗi IP, mặc định 10 |
| `ForwardedHeaders__Enabled` | không | `true` khi đặt sau reverse proxy. Khi bật **bắt buộc** có `ForwardedHeaders__KnownProxies__0` (IP) hoặc `ForwardedHeaders__KnownNetworks__0` (CIDR), nếu không API không khởi động. Mặc định tắt: header `X-Forwarded-For` bị bỏ qua để client không tự chọn IP |
| `Cors__AllowedOrigins__0` | không | Chỉ cần khi Frontend khác origin (danh sách rỗng mặc định) |
| `ASPNETCORE_ENVIRONMENT` | không | `Development` bật Swagger; Production thì tắt |

Không đưa secret vào source hay image. Dùng biến môi trường của nền tảng chạy hoặc secret store.

## Áp dụng schema
```bash
cd backend && dotnet tool restore
dotnet tool run dotnet-ef database update --project src/TaskManagement.Infrastructure --startup-project src/TaskManagement.API
```
Cần `ConnectionStrings__DefaultConnection` trong môi trường. Migration không tự chạy khi API khởi động (chủ đích: người vận hành quyết định thời điểm đổi schema).

## Chạy toàn bộ bằng Docker Compose
```bash
cp .env.example .env                           # đặt POSTGRES_PASSWORD và Jwt__Key
docker compose --profile app up -d --build --wait
docker compose --profile tools run --rm migrate   # lần đầu và mỗi khi có migration mới
```
Mở http://localhost:8080 (đổi cổng bằng `WEB_PORT`). Chỉ container `web` (nginx) được publish ra máy, trên `127.0.0.1`; `api` và `postgres` nằm trong mạng nội bộ của compose. `web` phục vụ file tĩnh, chuyển `/api/*` sang `api`, rơi các đường dẫn khác về `index.html`, và gắn CSP, `X-Content-Type-Options`, `Referrer-Policy`. `docker compose up -d --wait` không kèm `--profile app` vẫn chỉ chạy PostgreSQL cho phát triển.

Cấu hình mẫu là điểm khởi đầu, chưa có TLS: đặt thêm một bộ cân bằng tải hoặc chứng chỉ HTTPS phía trước khi mở ra Internet. Nếu có proxy khác phía trước nginx, xem phần HTTPS bên dưới để nginx lấy lại IP người dùng.

## Ứng dụng Mac độc lập (Electron)
Xem [README](../../README.md#ứng-dụng-mac-độc-lập-không-cần-docker-hay-trình-duyệt) và ADR-19.
- Build: `desktop/scripts/build.sh` (build Angular, `dotnet publish -r osx-arm64 --self-contained`, lấy PostgreSQL ghim phiên bản, electron-builder, ký ad hoc); `--install` chép vào `~/Applications` và gỡ launcher Docker.
- Dữ liệu: `~/Library/Application Support/TaskFlow Desktop/` (`pgdata/`, `logs/`, `backups/`, `secrets.bin`). Nhật ký: `logs/api.log`, `logs/postgres.log`.
- Biến `ELECTRON_RUN_AS_NODE` (VS Code đặt trong terminal của nó) làm ứng dụng thoát ngay không báo lỗi khi chạy từ terminal; chạy kiểm thử bằng `env -u ELECTRON_RUN_AS_NODE`. Mở từ Finder không bị ảnh hưởng.
- Biến kiểm thử: `TASKFLOW_USER_DATA` (thư mục dữ liệu khác), `TASKFLOW_HIDDEN=1` (không hiện cửa sổ).

## Cài như ứng dụng trên Mac bằng Docker (phương án cũ)
Xem [README](../../README.md#cài-như-ứng-dụng-trên-mac). Thiết kế:
- Dùng lại Docker Compose (profile `app`/`tools`) với project riêng `taskflow-app`, cổng 8765 (web) và 5433 (PostgreSQL), volume riêng nên không đụng dữ liệu phát triển.
- Bí mật (mật khẩu DB, khóa JWT) sinh ngẫu nhiên lần đầu bằng `openssl`, lưu ở `~/Library/Application Support/TaskFlow/.env` (quyền 600).
- `TaskFlow.app` và `Dừng TaskFlow.app` là hai gói `.app` nhỏ gọi `scripts/taskflow`; chạy từ bản sao mã nguồn ngoài `~/Documents` (TCC của macOS).
- Cửa sổ: `taskflow open` mở ứng dụng Chrome đã cài nếu có, nếu không thì chạy Chrome với `--app=URL` (cửa sổ không tab, không thanh địa chỉ); không bao giờ mở một tab thường.
- PWA: `manifest.webmanifest` (kiểu `application/manifest+json` do nginx khai báo) cùng icon 192/512/maskable; Chrome báo không có lỗi installability. Không dùng service worker.
- Không tự chạy khi đăng nhập (quyết định của chủ dự án): chỉ bật khi bấm `TaskFlow.app`.

## Bật HTTPS khi mở ra Internet
Cấu hình mẫu chỉ phục vụ HTTP trên `127.0.0.1`. Trước khi mở ra Internet, đặt một lớp TLS phía trước `web`. Điều kiện: một tên miền trỏ về máy chủ (A/AAAA record) và mở cổng 80, 443. Phần mềm dưới đây đều miễn phí; chi phí chỉ là tên miền và máy chủ.

**Cách đơn giản: Caddy trên máy chủ (tự lấy và gia hạn chứng chỉ Let's Encrypt)**
1. Cài Caddy theo hướng dẫn của hệ điều hành (hoặc chạy bằng image `caddy:2`).
2. `Caddyfile`:
   ```
   taskflow.example.com {
       reverse_proxy 127.0.0.1:8080
   }
   ```
3. Caddy tự thêm `X-Forwarded-For` (IP người dùng). Từ trong Docker, nginx thấy kết nối đến từ cổng nối (gateway) của mạng Docker chứ không phải IP người dùng, nên giới hạn đăng nhập sẽ gộp mọi người vào một hạn mức. Để nginx lấy lại IP thật, thêm vào khối `server` trong `frontend/nginx.conf`:
   ```
   set_real_ip_from 172.16.0.0/12;   # chỉ tin header từ mạng Docker (nơi Caddy kết nối vào)
   real_ip_header X-Forwarded-For;
   ```
   Khi đó `$remote_addr` là IP người dùng, và dòng `proxy_set_header X-Forwarded-For $remote_addr` hiện có sẽ chuyển đúng IP đó cho API (API đã tin mạng của nginx qua `ForwardedHeaders__KnownNetworks__0`). Chỉ làm vậy khi mọi truy cập đều đi qua Caddy: cổng 8080 hiện chỉ lắng nghe `127.0.0.1`, đừng mở ra ngoài. Phần này chưa được chạy thử trên máy chủ thật; hãy chạy bước kiểm tra bên dưới.
4. Sau khi có HTTPS, thêm header `Strict-Transport-Security: max-age=31536000` ở Caddy hoặc nginx.

**Phương án khác:** dùng dịch vụ có sẵn TLS (Cloudflare, bộ cân bằng tải của nhà cung cấp cloud) trỏ về `web`; các bước 3 và 4 vẫn áp dụng.

Kiểm tra sau khi bật: `curl -I https://taskflow.example.com/` trả 200 kèm `Content-Security-Policy`; đăng nhập sai 11 lần liên tiếp từ cùng một máy thì lần thứ 11 trả 429, còn máy khác vẫn đăng nhập được.

## Production không dùng compose
- Đặt Frontend và `/api` **cùng origin** sau một reverse proxy (ADR-15): proxy phục vụ file tĩnh, chuyển `/api/*` về Backend, và rơi mọi đường dẫn khác về `index.html` (SPA).
- Bắt buộc HTTPS ở proxy. Token nằm trong `localStorage` (ADR-06) nên nên thêm header CSP ở proxy.
- Sau reverse proxy phải bật `ForwardedHeaders__Enabled` kèm danh sách proxy tin cậy, nếu không giới hạn tần suất thấy IP của proxy và mọi người dùng chung một hạn mức (ADR-12, ADR-16).
- Sao lưu PostgreSQL theo chính sách riêng; xóa user sẽ xóa luôn task (`ON DELETE CASCADE`).

## Hạn chế đã biết
- JWT stateless: đăng xuất và đổi mật khẩu không vô hiệu hóa token đang lưu hành, hết hạn sau 60 phút (ADR-05).
- Quy tắc "khối giờ không vượt nửa đêm" chỉ kiểm ở Frontend (BR-13, decisions #53).
- Chưa có CI; TLS chỉ có hướng dẫn, chưa có cấu hình sẵn (xem phần HTTPS). Cấu hình nginx/compose được kiểm bằng curl; CSP đã được xác nhận bằng Chromium thật (không có lỗi console).
- Bundle khởi tạo 1,11 MB, vượt ngưỡng cảnh báo 1,1 MB nhưng dưới ngưỡng lỗi 1,5 MB.
