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
- `supabase/functions/fb-proxy/index.ts` — proxy Facebook: yêu cầu đăng nhập; mỗi tài khoản dùng **token của chính mình** (`user_metadata.fb_token`); token dự phòng `FB_ACCESS_TOKEN` chỉ cho email trong `ALLOWED_EMAILS`; POST `?path=` chỉ đổi `status` ACTIVE/PAUSED; mọi `access_token` trong phản hồi bị gỡ (`stripTokens`).
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
- **Page Access Token không bao giờ trả về trình duyệt**: proxy gỡ mọi trường `access_token` trong phản hồi (`stripTokens`, đã triển khai từ phiên bản 13).
- Git: remote `origin` = github.com/LuanNguyen148/CODE-ADS, nhánh `main`. Chỉ commit/push khi người dùng yêu cầu.
- CSS: lớp mới nhất là **v32** ở cuối `<style>` của `dashboard.html` (ghi đè bằng `body …` vì file `css/dashboard-christmas.css` nạp sau). Chữ vàng `#f1c96b` trên nền kem không đọc được → dùng nâu `#6b3f06`.
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
- **Tài khoản & token:** token đi liền với tài khoản, nhập khi đăng ký hoặc trong cửa sổ "Tài khoản". Không có ô token trên khung chính. Đăng xuất xóa token khỏi trình duyệt; nút **Đăng xuất chỉ ở menu trái**, cửa sổ Tài khoản không có.
- **Ghi nhớ đăng nhập:** cờ `ads_remember_v1` ('0' = không ghi nhớ). Phiên Supabase lưu đúng theo cờ (`localStorage` hoặc `sessionStorage`, hàm `ADS_SB_REMEMBER` trong `supabase-client.js`, gọi ngay trước `signInWithPassword` / `signUp`). Trang đăng nhập **hỏi Supabase** (`getSession`) khi mở: còn phiên thì khôi phục cờ `ads_auth_session_v1` và vào thẳng dashboard. Lỗi cũ (thấy trong nhật ký Supabase): token vừa làm mới thành công mà vài giây sau người dùng vẫn phải nhập mật khẩu. Bài thử `tests/remembertest.js`.
- **Token dán ở mục Tài khoản lấy tài khoản QC thành công → cửa sổ Tài khoản tự đóng** + thông báo "Đã lưu token — kết nối Facebook thành công" (cờ `fbTokenApplying`, hàm `fbTokenDone`); lỗi thì cửa sổ ở lại để dán lại.
- **Tab Cài đặt (`#v-settings`, tab `settings`):** (1) Giao diện Tự động/Sáng/Tối lưu `ads_theme_v1` — `window.ADS_SCENE()` ở script đầu trang là nguồn duy nhất cho `data-scene` (đồng hồ mỗi giây không được ép theo giờ); (2) Tuyết rơi bật/tắt lưu `ads_snow_v1`, class `no-snow` ở `<html>`; (3) Đổi mật khẩu: kiểm tra (hiện tại bắt buộc, mới ≥ 8 ký tự, khác cũ, nhập lại khớp) → `signInWithPassword` xác nhận mật khẩu cũ → `updateUser({password})`; lỗi Supabase dịch sang tiếng Việt (`viErr`); tài khoản test local bị khóa form. Cài đặt chỉ lưu trên thiết bị. Bài thử `tests/settingstest.js`.
- **Chế độ Tối (`data-scene="night"`):** mọi màu chữ ép cho nền sáng ở lớp v32 phải có bản `:root[data-scene="night"]` trả về chữ vàng `#f1c96b`; khi thêm CSS mới nhớ chụp ảnh cả hai chế độ.
- **Tab "Tổng theo bài" / "Tổng theo ngày":** ô "Số bài ads" KHÔNG còn dòng "Tốt · Theo dõi · Cắt/sửa", ô "CPQC chung" KHÔNG còn chữ đánh giá bên dưới (màu của con số đã cho biết); bảng phía dưới (`.stats table`) cùng phong cách bảng Báo cáo ngày: tiêu đề chữ hoa nhỏ, hàng thoáng, nhãn CPQC dạng viên đặc (Tốt xanh, Theo dõi vàng, Cắt đỏ, chưa có DS viền). Nhãn CPQC từng ngày đổi màu theo ngưỡng `t1`/`t2` (hàm `gr`), đổi ngưỡng thì màu đổi theo. Luật ở `css/dashboard-stats.css`. Bài thử `tests/statstest.js`. Bảng Báo cáo ngày: tên quảng cáo (ô nhập `.nm`) dài hiện "…" (trên điện thoại từng bị cắt cụt giữa chữ); công cụ đo bảng sáng/tối/desktop/mobile ở scratchpad `tools/tblcheck.js`. Cân đối cột (đo bằng `tools/tblaudit.js`): `#stab` và `#atab` dùng `table-layout:fixed` (cột đầu 22% / 24%, các cột số rộng đều; `#stab` min-width 640px, `#atab` 960px để điện thoại cuộn ngang thay vì ép cột); tiêu đề cột đầu `.tbl` thụt 16px như ô. Ô Tiền chạy/Doanh số ở bảng cấp Quảng cáo hiện có dấu chấm (7.000.000, `moneyShow`), bấm vào thì về số gốc (focusin/focusout trên `#list`); dữ liệu lưu vẫn là số gốc. Bài thử `tests/numfmttest.js`.
- **Nhãn ngày dưới biểu đồ "Tổng theo ngày":** cỡ 12px, đậm, màu chữ chính (`--tx`); ngày chưa có dữ liệu chỉ nhạt bớt ở chữ (opacity .72), KHÔNG làm mờ cả cột. Luật nằm ở `css/dashboard-stats.css` (file này nạp SAU `<style>` trong trang nên thắng khi cùng độ ưu tiên; sửa xong phải tăng `?v=` trong `dashboard.html`). Bài thử `csslayouttest.js` đọc cả CSS ngoài.
- **Dóng hàng + popup cố định (lớp v37, đo bằng Playwright `align.js`):** điều khiển cùng cao 44px (chọn TK, nhãn trạng thái, nút đồng bộ, tab, ngày, thẻ/bảng, sắp xếp); đầu thẻ canh tâm theo hàng đầu; ô số liệu `grid-auto-rows:1fr`; **popup Tài khoản cao cố định 440px** (`.acct[open]{height:min(440px,…)}`, thân cuộn bên trong) để đổi tab Facebook/Dư nợ không bị nở; ô Doanh số/Số ĐT ở thẻ Chiến dịch/Nhóm QC **cùng màu** các ô còn lại (chỉ ô nhập ở thẻ Quảng cáo có nền trắng). Tiền chạy + Doanh số có thêm dòng **"Tăng/Giảm X đ so với hôm qua"** (`setDeltaAmt`, class `.kdv`). Bài thử `tests/csslayouttest.js`.
- **Ô nhập / ô hiển thị ở báo cáo ngày (chế độ Sáng, lớp v36):** thẻ gần đặc; ô chỉ xem nền nâu kem `#EFE2CF` + viền nâu mảnh; **ô nhập nền trắng + viền vàng đậm `#B9823A` 1,5px** + dấu ✎ đỏ; nhãn `#5B3A2E` đậm, số `#2B0F0A` cỡ 16 (tương phản 7,9–17,9). Chế độ Tối ĐÃ ổn, người dùng không muốn đổi. Bài thử `nightcsstest.js` canh v36 chỉ nằm trong `:root[data-scene="day"]`.
- **Phong cách kính mờ cho CẢ HAI chế độ:** v33 (Tối) và v34 (Sáng, kính trắng ấm + viền vàng) cùng bố cục; hai khối độc lập, mỗi bộ chọn phải bắt đầu bằng `:root[data-scene="night"]` / `:root[data-scene="day"]` tương ứng (bài thử `tests/nightcsstest.js` canh cả hai). Muốn đổi kiểu thẻ thì sửa ĐỦ hai khối.
- **Phong cách chế độ Tối (lớp CSS v33, học từ Vision UI Dashboard, giữ tông Giáng sinh):** thẻ kính mờ (gradient đỏ rượu + `backdrop-filter` chỉ cho vài thẻ lớn, KHÔNG gắn cho từng thẻ trong danh sách), 4 ô số liệu đầu trang có icon vàng, vòng tròn CPQC phát sáng, thanh tiến độ/biểu cột gradient + lưới ngang, nền có quầng sáng đỏ/vàng. **Mọi bộ chọn v33 phải bắt đầu bằng `:root[data-scene="night"]`** (chế độ Sáng không đổi) — bài thử `tests/nightcsstest.js` canh điều này; khối v33 nằm giữa hai dòng chú thích `v33` và `hết v33`.
- **Học từ Vision UI (lớp CSS v35, dùng biến màu nên đúng cả Sáng lẫn Tối):** (1) 4 ô số liệu đầu trang có **% so với hôm qua** (`prevPeriod`, `setDelta`; khoảng ngày thì so với khoảng liền trước cùng độ dài; trước kỳ = 0 thì ẩn; tiền chạy luôn trung tính, các chỉ số còn lại xanh/đỏ), bài thử `tests/deltatest.js`; (2) chế độ Bảng: tiêu đề cột chữ hoa nhỏ, hàng thoáng, avatar chữ cái bo vuông, nhãn đánh giá dạng viên thuốc (Tốt xanh, Theo dõi vàng, Cắt đỏ, Chưa có DS viền); (3) Cài đặt + Tài khoản có tiêu đề hồ sơ (avatar bo vuông) và **nút tab viên thuốc** (`.pill-tabs`, ẩn/hiện bằng lớp `.pane-off`, KHÔNG dùng thuộc tính `hidden` vì `#debt-pop` đã dùng `hidden` riêng), bấm huy hiệu dư nợ thì mở thẳng tab Dư nợ, bài thử `tests/panetest.js`; (4) menu trái: icon trong ô vuông bo tròn, mục đang chọn là thanh kính mờ + icon vàng. **Cẩn thận:** class `.sp`/`.sr` vừa là cột biểu đồ vừa là ô bảng (`td.sp`) → luật biểu đồ phải viết `.sbars i.sp`, không viết `.sp` trần.
- **Dashboard không tải được thư viện Supabase** (mạng/CDN lỗi): **không xóa phiên**, chỉ hiện khung `#ads-offline` có nút "Tải lại trang", nội dung vẫn ẩn. Bài thử `tests/offlinetest.js`.
- **Bật/Tắt quảng cáo:** hiện tất cả chiến dịch/nhóm/quảng cáo (kể cả chưa tiêu tiền), phân trang 10/20/50/100 (mặc định 10), công tắc gửi `POST status=ACTIVE|PAUSED`, thông báo có **Hoàn tác**.
- **Điện thoại / máy tính bảng (< 1100px): nút menu nổi `#fab-menu`** (☰ tròn đỏ viền vàng, mặc định góc dưới trái) thay cho thanh nổi `mini-bar` (đã gỡ hẳn CSS/HTML/JS) và nút ☰ cũ ở đầu trang (`#side-open` ẩn, vẫn giữ trong DOM). Chạm → mở menu trái; giữ và kéo (ngưỡng 8px) → đặt đâu cũng được, kẹp trong màn hình, nhớ vị trí theo tỉ lệ ở `ads_fab_pos_v1`; kéo xong không tự mở menu. Máy tính ẩn nút. Bài thử `tests/fabtest.js`; thử cảm ứng thật bằng scratchpad `tools/fabshot.js`.
- **Thông báo:** góc trên phải (máy tính), đáy màn hình (điện thoại), tối đa 3 thẻ, lỗi không tự tắt.
- **Dư nợ:** nằm trong cửa sổ **Tài khoản** (`#debt-pop`), chỉ hiện `balance` + link thanh toán trên Facebook; nút "Tài khoản" ở menu trái có huy hiệu số dư (`#side-debt`) khi còn nợ. **Không làm popup nổi góc dưới phải** (bị huy hiệu "Powered by Netlify" che).
- **Thông báo tải tài khoản:** "Đã tải thành công tài khoản <tên>" (tên bỏ phần "(mã số)" bằng `accShortName`).
- **Chữ bị cắt "…":** bấm vào hiện khung `#fulltip` với tên đầy đủ (danh sách selector `TRUNC` trong `dashboard.html`); ở thẻ Chiến dịch/Nhóm QC bấm tên chỉ xem tên, mở cấp tiếp theo bằng nút "Mở … ➔". Ô chọn TKQC (`<select>`) dùng danh sách gốc của trình duyệt nên không áp dụng.
- **Chọn ngày:** nút trên hàng tab; chọn 1 ngày hoặc khoảng Từ–Đến (tối đa 31 ngày), khoảng chỉ xem.
- **Hàng điều khiển trên các tab:** ô chọn TKQC bên trái, nút đồng bộ bên phải. Đổi tab thì hàng này đi theo.
- **Tiêu đề danh sách:** "1. Chiến dịch" / "2. Tất cả Nhóm quảng cáo" / "3. Tất cả Quảng cáo" — không kèm tên tài khoản dài.
- **Vòng tròn CPQC:** không hiện chữ "Cắt / sửa" (chỉ đổi màu đỏ).
- **Đã bỏ hẳn:** tab Thanh toán (trang), ô nhập "Tên" (tên lấy từ tài khoản đăng nhập), nút "Dọn dữ liệu rác / 0đ", cột phải "Đồng bộ Facebook", mục "Kết nối Facebook" ở menu.

- **Đồng bộ cloud (Supabase `ads_user_state`):** mọi lần đẩy bị giữ lại (`ADS_CLOUD` hold) cho tới khi trang đọc xong cloud. So sánh bằng mốc riêng `KEY-cloudts` (chỉ đổi khi nhận từ / đẩy lên cloud thành công), **không** dùng thời điểm `save()`. Máy mới lấy cloud; lỗi đọc cloud thì không đẩy gì; máy cũ chưa có mốc nhưng có nhiều SĐT/doanh số hơn cloud thì giữ máy và khôi phục cloud. Đã có bài thử `tests/cloudtest.js` (lỗi cũ: máy mới ghi đè dữ liệu nhập tay của máy khác).
  - Sau khi nhận bản cloud và trước khi nạp lại trang, `window.ADS_RELOADING = true` và `save()` không làm gì (lỗi cũ: mạng chậm, danh sách TK Facebook về sau cloud → `save()` ghi đè bản vừa nhận bằng bản rỗng).
  - TKQC đang xem được nhớ trong state là `S.lastAcc` (đồng bộ cloud). Máy chưa từng chọn TK (điện thoại đăng nhập lần đầu) mở đúng TK này thay vì TK đầu danh sách Facebook.
- **Bật/Tắt:** mặc định 10 mục/trang (10/20/50/100, lưu `ads_tg_pagesize_v2`); bộ lọc "Tất cả" đưa mục ĐANG BẬT lên đầu.
- **Đã thử rồi bỏ (người dùng thấy rườm rà):** thanh bộ lọc kiểu Ads Manager và hàng chỉ số hiển thị/tiếp cận/tần suất/nhấp/CTR/CPC/CPM. Đừng làm lại nếu không được yêu cầu.
- **Chọn nhiều Chiến dịch / Nhóm QC (báo cáo ngày):** ô tick trên thẻ/dòng (`pickCamp`, `pickAdset`), chỉ là bộ lọc hiển thị + thanh tổng hợp `#pick-bar`, không ghi vào dữ liệu. Đi sâu bằng cách bấm thẻ thì ưu tiên chế độ đó.
- **Đã thử rồi bỏ (người dùng thấy rườm rà):** tab **Tin nhắn Fanpage** (đọc/trả lời Messenger, kiểu hộp thư Business Suite). Đã gỡ khỏi web và proxy. Ghi chú nếu làm lại: cần quyền `pages_show_list`, `pages_messaging`, `pages_read_engagement`; Page token phải ở server; trang tài liệu `saved_message_responses` đã 404.

## 7. Kiểm thử (bài thử nằm trong repo)
- Chạy toàn bộ: `npm test` (cần `npm install` một lần; runner `tests/run-all.js`, 25 bài).
- Bài thử proxy chạy `index.ts` bằng Node sau khi gỡ chú thích kiểu TypeScript bằng regex → khi sửa proxy chỉ dùng chú thích kiểu đơn giản (`x: string`, `): unknown {`), không dùng `as`, generic phức tạp.
- Lệnh shell (Bash) làm **mất dấu `\`** khi ghi code qua heredoc/node -e → sửa code có regex bằng công cụ Edit.
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
