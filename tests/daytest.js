// jsdom: "Tên" removed; Ads Manager-style date button.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const today = new Date(), yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
const lbl = d => d.getDate() + ' Tháng ' + (d.getMonth() + 1) + ', ' + d.getFullYear();
(async () => {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
    w.ADS_LOCAL_SESSION = true; // giả lập phiên test local hợp lệ (supabase-client.js không chạy trong jsdom)
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'shop@example.com', name: 'Shop Noel', fbToken: 'EAAt' }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      w.matchMedia = q => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.navigator.clipboard = { writeText: t => { w.__copied = t; return Promise.resolve(); } };
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(400);
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const label = () => d.getElementById('dp-label').textContent;
  check(!d.getElementById('who') && !/>Tên</.test(d.body.innerHTML), 'đã bỏ ô "Tên"');
  check(d.getElementById('metaDay').parentNode.id === 'hier-date-slot', 'nút ngày nằm bên phải hàng tab Chiến dịch / Nhóm QC / Quảng cáo');
  check(label() === 'Hôm nay: ' + lbl(today), 'nhãn: "' + label() + '"');
  check(d.querySelector('[data-dp-step="1"]').disabled && d.getElementById('day').max === key(today), 'không cho chọn ngày tương lai ("Ngày sau" khóa ở hôm nay)');
  d.getElementById('dp-btn').click();
  check(!d.getElementById('dp-pop').hidden && d.getElementById('dp-btn').getAttribute('aria-expanded') === 'true', 'bấm nút → mở bảng chọn ngày');
  check(d.querySelector('[data-dp="0"]').getAttribute('aria-pressed') === 'true', '"Hôm nay" đang được tô');
  d.querySelector('[data-dp="-1"]').click();
  await wait(50);
  check(d.getElementById('day').value === key(yest) && label() === 'Hôm qua: ' + lbl(yest), 'chọn "Hôm qua" → đổi ngày, nhãn "' + label() + '"');
  check(d.getElementById('dp-pop').hidden, 'chọn xong → bảng tự đóng');
  d.getElementById('dp-btn').click();
  d.querySelector('[data-dp-step="-1"]').click();
  await wait(50);
  const d2 = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate() - 1);
  check(d.getElementById('day').value === key(d2) && label().startsWith(['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][d2.getDay()] + ', '), '"‹ Ngày trước" → lùi 1 ngày, nhãn thứ trong tuần: "' + label() + '"');
  d.getElementById('dp-btn').click();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  check(d.getElementById('dp-pop').hidden, 'phím Esc đóng bảng chọn');
  d.getElementById('dp-btn').click(); d.body.click();
  check(d.getElementById('dp-pop').hidden, 'bấm ra ngoài → đóng bảng chọn');
  // Tab Bật/Tắt: nút ngày chuyển lên đầu danh sách; tab thống kê: ẩn
  d.querySelector('#side [data-side-tab="toggle"]').click(); await wait(50);
  check(d.getElementById('metaDay').hidden && !d.getElementById('tg-date-slot'), 'tab Bật/Tắt: KHÔNG có nút chọn ngày (trạng thái bật/tắt không cần lọc theo ngày)');
  d.querySelector('#side [data-side-tab="days"]').click(); await wait(50);
  check(d.getElementById('metaDay').parentNode.id === 'rng-date-slot' && !d.getElementById('metaDay').hidden, 'tab Thống kê theo ngày: dùng chung nút ngày với Báo cáo ngày');
  d.querySelector('#side [data-side-tab="day"]').click(); await wait(50);
  check(d.getElementById('metaDay').parentNode.id === 'hier-date-slot' && !d.getElementById('metaDay').hidden, 'quay lại Báo cáo ngày: nút ngày về hàng tab');
  // Báo cáo sao chép vẫn có tên (lấy từ tài khoản đăng nhập)
  d.getElementById('gen').click(); await wait(50);
  check(/^Shop Noel/.test(d.getElementById('out').textContent), 'báo cáo vẫn ghi tên người dùng (lấy từ tài khoản): "' + d.getElementById('out').textContent.split('\n')[0] + '"');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  w.close();
})();
