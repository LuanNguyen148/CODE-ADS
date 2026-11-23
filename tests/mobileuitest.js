// Giao diện điện thoại (iOS): thanh trên gọn, tiêu đề lớn theo từng màn, ảnh đại diện mở Tài khoản, hộp thoại dạng tấm trượt từ đáy.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ROOT = path.dirname(path.resolve(process.argv[2]));
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

(async () => {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'luan148', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(700);
  const mt = d.getElementById('m-title');
  check(mt && mt.getAttribute('role') === 'heading' && mt.getAttribute('aria-level') === '1' && mt.textContent === 'Báo cáo ngày', 'có tiêu đề lớn #m-title (heading cấp 1), mặc định "Báo cáo ngày"');
  for (const [tab, title] of [['days', 'Tổng theo ngày'], ['toggle', 'Bật / Tắt quảng cáo'], ['notify', 'Thông báo'], ['settings', 'Cài đặt'], ['day', 'Báo cáo ngày']]) {
    d.getElementById('bn-' + tab).click(); await wait(150);
    check(mt.textContent === title, 'đổi sang màn "' + tab + '" → tiêu đề lớn thành "' + title + '"');
  }
  const av = d.getElementById('user-avatar');
  check(av.hasAttribute('data-open-account') && av.getAttribute('role') === 'button' && av.tabIndex === 0 && !!av.getAttribute('aria-label'), 'ảnh đại diện là nút (có nhãn, bàn phím tới được) và mở cửa sổ Tài khoản');
  av.click(); await wait(300);
  const dlg = d.getElementById('acct-dialog');
  check(dlg.hasAttribute('open'), 'chạm ảnh đại diện → mở cửa sổ Tài khoản');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  const css = fs.readFileSync(path.join(ROOT, 'css', 'ui-polish.css'), 'utf8');
  const blk = css.slice(css.indexOf('/* ===== Giao diện ĐIỆN THOẠI (iOS)'));
  check(/^\.m-title\{display:none\}/m.test(blk), 'ngoài điện thoại (web) tiêu đề lớn bị ẩn — web không đổi');
  check(/@media \(max-width:760px\),\(hover:none\) and \(pointer:coarse\) and \(max-width:1099px\)\{/.test(blk), 'chỉ áp dụng cho màn ≤ 760px hoặc thiết bị cảm ứng < 1100px (cùng điều kiện với thanh dưới)');
  check(/body \.auth-bar \.auth-info,body \.auth-bar \.side-open,body \.auth-bar \.logout-btn\{display:none\}/.test(blk), 'thanh tài khoản gọn: bỏ email, nút ☰ cũ, nút Đăng xuất (đã có ở menu trái)');
  check(/body \.banner \.bt h1,body \.banner \.bt>p:not\(\.m-title\),body \.banner \.tabs,body \.banner \.deco\{display:none\}/.test(blk), 'banner gọn: bỏ dòng mô tả, tab (đã chuyển xuống thanh dưới), hình trang trí');
  check(/body \.banner \.bt \.m-title\{display:block[^}]*font-size:34px/.test(blk) && /Cormorant Garamond/.test(blk), 'tiêu đề lớn 34px, chữ Cormorant Garamond đúng bộ chữ chủ đề Giáng sinh');
  check(/body \.banner \.clock\{order:2;/.test(blk), 'đồng hồ nhỏ nằm bên phải, tiêu đề bên trái');
  check(/body \.auth-bar \.xmas-logo \.brand-name\{display:inline\}/.test(blk), 'giữ tên thương hiệu adsCGD cạnh logo');
  check(/body \.rep>h2:first-child,body \.tg-head h2,body #v-notify \.set-who h2,body #v-settings \.set-who h2\{position:absolute;[^}]*clip:rect/.test(blk), 'tiêu đề trùng trong thẻ chỉ ẩn khỏi mắt, vẫn cho trình đọc màn hình');
  check(/dialog\.acct\[open\],dialog\.ap-dlg\[open\]\{position:fixed;inset:auto 0 0 0;[^}]*border-radius:26px 26px 0 0[^}]*animation:sheetUp/.test(blk) && /@keyframes sheetUp/.test(blk), 'hộp thoại (Tài khoản, Tự tắt, Nhật ký) thành tấm trượt từ đáy, bo góc trên, có chuyển động mở');
  check(/dialog\.acct\[open\]::before[^}]*width:40px;height:5px/.test(blk), 'có thanh nắm kéo nhỏ ở đỉnh tấm trượt');
  check(/prefers-reduced-motion:reduce\)\{dialog\.acct\[open\],dialog\.ap-dlg\[open\]\{animation:none\}/.test(blk), 'tôn trọng "giảm chuyển động" của hệ thống');
  // ----- UX điện thoại (rà soát bằng skill design-critique) -----
  const ux = css.slice(css.indexOf('/* ===== UX điện thoại'));
  const sw = ['tn-report', 'tn-paused', 'tn-problem', 'tn-dry'].map(id => new RegExp('<label class="set-switch tn-sw"><input type="checkbox" id="' + id + '"[^>]*><span class="set-track" aria-hidden="true"></span><span>[^<]+</span></label>').test(html));
  check(sw.every(Boolean), 'tab Thông báo: 4 lựa chọn bật/tắt là CÔNG TẮC kiểu iOS (nhãn trái, công tắc phải), id giữ nguyên');
  check(!/class="ap-chk tn-chk"/.test(html), 'không còn ô tick vuông trong tab Thông báo');
  check(/body #v-notify \.set-head\{display:none\}/.test(ux), 'tab Thông báo: bỏ khối biểu tượng trống đầu thẻ (tiêu đề đã ở banner)');
  check(/body #fb-sync-btn\{[^}]*linear-gradient\(120deg,#a31118,#750812\)/.test(ux) && /min-height:46px/.test(ux), 'nút "Lấy số liệu": màu đỏ chủ đề (không còn xanh dương lạc tông), cao 46px');
  check(/body \.hier-tools #hier-date-slot\{flex:1 1 100%/.test(ux) && /body \.hier-tools \.hier-sort\{font-size:0\}/.test(ux), 'bộ lọc gọn: ngày một hàng; Thẻ/Bảng và Sắp xếp chung một hàng, bỏ chữ "Sắp xếp" thừa');
  check(/body \.drill-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(ux) && /body \.drill-card \.lvl-tag\{display:none\}/.test(ux), 'thẻ chiến dịch: số liệu 3 cột (thay vì 2) và bỏ nhãn cấp "CHIẾN DỊCH" trùng tiêu đề → thấp hơn khoảng 40%');
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
