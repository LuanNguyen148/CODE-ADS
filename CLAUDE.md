# CLAUDE.md — Bộ nhớ làm việc cho dự án adsCGD

Đây là hướng dẫn thường trực cho Claude khi làm việc trong thư mục này. Đọc hết trước khi sửa bất cứ thứ gì.

## 1. Dự án là gì
- **adsCGD** — web tĩnh (HTML/CSS/JS thuần, không build) để đánh giá chỉ số quảng cáo Facebook Ads: CPQC, mess, số điện thoại, doanh số, theo chiến dịch → nhóm QC → quảng cáo.
- Trang vào: `index.html` (đăng nhập/đăng ký) → `dashboard.html` (toàn bộ chức năng).
- Backend: Supabase (auth + bảng `ads_user_state` + Edge Function `supabase/functions/fb-proxy`). Project ref: `vqcursweeddjrtvwacur`.
- Chủ đề **Giáng sinh** là bắt buộc giữ: nền đỏ hoa văn tuyết, dây đèn, tuyết rơi, mèo con, xe tuần lộc, nhạc Jingle Bells, cảnh ngày/đêm. **Không bỏ hiệu ứng nào** khi tối ưu.
- Giao diện, nhãn và thông báo đều **tiếng Việt**. Trả lời người dùng bằng tiếng Việt.

## 2. Cấu trúc quan trọng
- `js/config.js` — cấu hình (nhạc, hiệu ứng, Supabase URL + anon key, **localDev** = tài khoản test chỉ chạy trên localhost).
- `js/supabase-client.js` — kết nối Supabase; `window.ADS_LOCAL_SESSION` cho phiên test local.
- `js/auth-feedback.js` — đăng nhập/đăng ký; đăng ký có **kiểm tra token Facebook** trước khi tạo tài khoản.
- `js/app.js` — form, validate, menu, animation trang đăng nhập.
- `js/bootstrap.js` — tải script hiệu ứng song song nhưng giữ đúng thứ tự (`async=false`).
- `js/logout-popup.js` — đăng xuất: xóa phiên + token.
- `css/*.css` — `styles.css` (trang đăng nhập), `dashboard-christmas.css`, `dashboard-stats.css`, `frame-menu.css`, `fonts.css`.
- `dashboard.html` — **file lớn (~3.200 dòng)** chứa CSS + JS inline. Các khối chính:
  - Script `<head>`: chỉ kiểm tra đăng nhập (không đặt code tính năng ở đây).
  - Script chính: dữ liệu theo ngày/tài khoản (`S`, `S.byAcc`), báo cáo, tích hợp Facebook, tab Bật/Tắt (`tgBuildHierarchy`, `renderToggleView`), phân trang, thông báo (`toast`), popup dư nợ, cửa sổ Tài khoản (`openAccount`), chọn ngày/khoảng ngày (`dpSet`, `VR()`).
- `supabase/functions/fb-proxy/index.ts` — proxy Facebook: yêu cầu đăng nhập; mỗi tài khoản dùng **token của chính mình** (`user_metadata.fb_token`); token dự phòng `FB_ACCESS_TOKEN` chỉ cho email trong `ALLOWED_EMAILS`; POST chỉ đổi `status` ACTIVE/PAUSED.
- `image/` — logo `logo-adscgd.webp`, favicon, ảnh nền Giáng sinh (`.webp` đã thay `.jpg/.png` ở chỗ dùng). `logo-day/night.png` là logo cũ, không còn dùng.

## 3. Quy tắc làm việc (bắt buộc)
1. **Dùng skill trước khi làm việc chính.** Plugin đã bật: `superpowers:*` và `engineering:*`.
   - Lỗi / kết quả bất thường → `superpowers:systematic-debugging` (tìm nguyên nhân trước, không đoán sửa).
   - Thêm tính năng / sửa lỗi → `superpowers:test-driven-development`.
   - Trước khi báo "xong" → `superpowers:verification-before-completion` (chạy bài thử, nêu rõ cái gì chưa kiểm tra được).
   - Nhận góp ý review → `superpowers:receiving-code-review` (kiểm tra từng ý, không làm theo máy móc).
   - Review thay đổi → `engineering:code-review`.
2. **Sao lưu trước khi sửa lớn** `dashboard.html` / `index.html`: copy sang thư mục scratchpad rồi mới áp dụng thay đổi.
3. **Kiểm thử bằng jsdom** (không có trình duyệt thật trong phiên): chạy trang với dữ liệu giả, kiểm tra cú pháp `new Function(...)` cho từng `<script>`, và kiểm tra CSS cân bằng dấu `{}`. Nói rõ với người dùng là **chưa thử trên trình duyệt thật / tài khoản Facebook thật** khi chưa thử.
4. **Không ghi đè dữ liệu người dùng.** Khoảng ngày chỉ để xem; số liệu từng ngày (`S.byAcc[acc].days[ngày]`) là dữ liệu thật, không lưu số gộp vào đó.
5. **Không sửa ngoài yêu cầu.** Giữ nguyên hiệu ứng Giáng sinh, giữ nguyên các chức năng đã được người dùng chấp nhận.
6. **Lệnh có tác động production** (deploy function, đặt secret Supabase): hỏi xác nhận trước; chỉ chạy khi người dùng đồng ý rõ ràng.
7. Khi nói về ngày, dùng `sd()` / `ld()` / `ad()` có sẵn trong code (định dạng `YYYY-MM-DD`).

## 4. Quy tắc bảo mật (quan trọng)
- **Không đưa token, mật khẩu, service_role key hay secret vào file nào trong repo, hay vào câu trả lời.** Token Facebook (`EAA…`) chỉ nhập qua cửa sổ **Tài khoản** hoặc đăng ký, và chỉ lưu ở `user_metadata` hoặc phiên đăng nhập.
- Không hiển thị đầy đủ token trong log hay ảnh chụp. Nếu người dùng gửi ảnh có lộ token, nhắc họ nên tạo token mới.
- Email trong `ALLOWED_EMAILS` và tài khoản test là thông tin cá nhân — đừng chép vào file mã nguồn.
- Proxy `fb-proxy` không được mở thêm đường dẫn hay thao tác ghi nào ngoài đổi trạng thái ACTIVE/PAUSED.
- Đã khởi tạo git (chưa có commit đầu tiên). Chỉ commit khi người dùng yêu cầu.
- Hằng số phiên bản Graph API: `window.ADS_FB_API` trong `js/config.js` (có giá trị dự phòng trong từng file). Đổi phiên bản chỉ sửa ở đây.
- Thư viện Supabase tải từ CDN có SRI `sha384` (trong `index.html` và `dashboard.html`). Nâng phiên bản thì phải tính lại mã.

## 5. Facebook Graph API — điều đã kiểm chứng
- Phiên bản đang dùng: **v21.0** trong code (tài liệu đối chiếu: v27.0).
- **Không có** trường `adspaymentcycle` / `threshold_amount` (Facebook trả lỗi `#100 nonexisting field`). Không gọi lại. Ngưỡng thanh toán **không lấy được qua API công khai** → UI chỉ hiện link "Xem trên Facebook".
- Cũng không có trong tài liệu Ad Account: `next_bill_date`, `adtrust_dsl`, `current_unbilled_spend`. Nếu cần dùng, phải thử từng trường riêng để tránh một trường lỗi làm hỏng cả câu gọi.
- Trường an toàn (có trong tài liệu): `name`, `account_id`, `currency`, `balance`, `amount_spent`, `spend_cap`, `account_status`, `disable_reason`, `funding_source_details` (cần quyền MANAGE), `is_prepay_account`, `business`, `user_tasks`, `created_time`, `timezone_offset_hours_utc`, và cạnh `activities`.
- Đơn vị tiền: VND không chia 100; USD và các tiền tệ có phần lẻ thì số Facebook trả về là **cent**, phải chia 100. Phiếu tín dụng (`coupons`) nhân 100 **kể cả VND** → hiển thị theo `display_amount`.
- `account_status`: 1 hoạt động, 2 vô hiệu hóa, 3 chưa thanh toán, 7/8/9 chờ duyệt/thanh toán/ân hạn, 100/101 đóng.
- Nhiều lỗi Graph được trả về nguyên văn: mã `#100` = trường không tồn tại; lỗi quyền có mã khác.

## 6. Tính năng đã chốt (không đổi nếu người dùng không yêu cầu)
- **Tài khoản & token:** token đi liền với tài khoản, nhập khi đăng ký hoặc trong cửa sổ "Tài khoản". Không có ô token trên khung chính. Đăng xuất xóa token khỏi trình duyệt.
- **Bật/Tắt quảng cáo:** hiện tất cả chiến dịch/nhóm/quảng cáo (kể cả chưa tiêu tiền), phân trang 20/50/100, công tắc gửi `POST status=ACTIVE|PAUSED`, thông báo có **Hoàn tác**.
- **Thông báo:** góc trên phải (máy tính), đáy màn hình (điện thoại), tối đa 3 thẻ, lỗi không tự tắt.
- **Popup Dư nợ:** góc dưới phải, chỉ hiện `balance` + link thanh toán trên Facebook. Thu gọn được.
- **Chọn ngày:** nút trên hàng tab; chọn 1 ngày hoặc khoảng Từ–Đến (tối đa 31 ngày), khoảng chỉ xem.
- **Hàng điều khiển trên các tab:** ô chọn TKQC bên trái, nút đồng bộ bên phải. Đổi tab thì hàng này đi theo.
- **Tiêu đề danh sách:** "1. Chiến dịch" / "2. Tất cả Nhóm quảng cáo" / "3. Tất cả Quảng cáo" — không kèm tên tài khoản dài.
- **Vòng tròn CPQC:** không hiện chữ "Cắt / sửa" (chỉ đổi màu đỏ).
- **Đã bỏ hẳn:** tab Thanh toán (trang), ô nhập "Tên" (tên lấy từ tài khoản đăng nhập), nút "Dọn dữ liệu rác / 0đ", cột phải "Đồng bộ Facebook", mục "Kết nối Facebook" ở menu.

- **Đồng bộ cloud (Supabase `ads_user_state`):** mọi lần đẩy bị giữ lại (`ADS_CLOUD` hold) cho tới khi trang đọc xong cloud. So sánh bằng mốc riêng `KEY-cloudts` (chỉ đổi khi nhận từ / đẩy lên cloud thành công), **không** dùng thời điểm `save()`. Máy mới lấy cloud; lỗi đọc cloud thì không đẩy gì; máy cũ chưa có mốc nhưng có nhiều SĐT/doanh số hơn cloud thì giữ máy và khôi phục cloud. Đã có bài thử `tests/cloudtest.js` (lỗi cũ: máy mới ghi đè dữ liệu nhập tay của máy khác).

## 7. Kiểm thử (bài thử nằm trong repo)
- Chạy toàn bộ: `npm test` (cần `npm install` một lần; runner `tests/run-all.js`, 12 bài).
- Bài thử dùng jsdom với dữ liệu giả. Đặt `ADS_LOCAL_SESSION = true` vì `supabase-client.js` không chạy trong jsdom.
- Chụp ảnh thật: Playwright (`playwright-core`) + Microsoft Edge có sẵn trên máy (Python chưa cài). Thư mục skill webapp-testing không có `scripts/`.
- Sau mỗi thay đổi: chạy `npm test`, kiểm tra cú pháp từng khối `<script>`, rồi mới báo xong và nêu kết quả.
- Trước đây có lần cắt nhầm code khi thay khối lớn; bài thử đã phát hiện.
- Server localhost không chạy được trong phiên (bị từ chối quyền); ảnh xem trong app chỉ là ảnh tĩnh, không chạy JavaScript.

## 8. Lưu ý khi làm việc với người dùng
- Người dùng muốn câu trả lời ngắn, rõ, có kết luận trước, chi tiết sau.
- Với mỗi thay đổi, báo: đã làm gì, thử bằng gì, kết quả, và **cái gì chưa kiểm tra được**.
- Khi người dùng nói "đưa skill vào" hoặc "dùng plugin", kiểm tra bằng `ListSkills` / `ListPlugins` trước khi trả lời là có hay không.
- Khi có lỗi từ Facebook hoặc Supabase, yêu cầu người dùng gửi **dòng lỗi nguyên văn** trước khi đoán nguyên nhân.
