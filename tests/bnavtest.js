// Điện thoại / máy tính bảng cảm ứng: tab chức năng chuyển xuống THANH DƯỚI (bottom navbar); web (chuột) vẫn giữ tab ở banner.
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
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(700);
  const bn = d.getElementById('bnav'), btns = [...bn.querySelectorAll('button')];
  const cur = () => (bn.querySelector('[aria-current]') || {}).id;
  check(bn && bn.tagName === 'NAV' && bn.getAttribute('aria-label') === 'Chức năng chính', 'có thanh chức năng dưới <nav id="bnav"> có nhãn "Chức năng chính"');
  check(btns.map(b => b.dataset.tab).join() === 'day,days,toggle,notify,settings', 'đủ 5 mục đúng thứ tự: Báo cáo ngày, Tổng theo ngày, Bật/Tắt, Thông báo, Cài đặt');
  check(btns.every(b => b.querySelector('svg[aria-hidden="true"]') && b.querySelector('span') && b.getAttribute('aria-label') && b.type === 'button'), 'mỗi mục có biểu tượng, chữ ngắn và nhãn đầy đủ cho trình đọc màn hình');
  check(btns.map(b => b.querySelector('span').textContent).join('|') === 'Báo cáo|Tổng ngày|Bật/Tắt|Thông báo|Cài đặt', 'chữ ngắn gọn: Báo cáo | Tổng ngày | Bật/Tắt | Thông báo | Cài đặt');
  check(cur() === 'bn-day', 'mặc định đang ở "Báo cáo" (aria-current="page")');

  for (const [k, vid] of [['toggle', 'v-toggle'], ['notify', 'v-notify'], ['settings', 'v-settings'], ['days', 'v-days'], ['day', 'v-day']]) {
    d.getElementById('bn-' + k).click(); await wait(200);
    check(!d.getElementById(vid).hidden && cur() === 'bn-' + k && d.getElementById('tab-' + k).getAttribute('aria-selected') === 'true' && btns.filter(b => b.hasAttribute('aria-current')).length === 1, 'bấm "' + k + '" → hiện đúng màn, chỉ MỘT mục sáng, tab trên banner đồng bộ');
  }
  // đổi tab bằng cách khác (tab trên banner / menu trái) thì thanh dưới sáng theo
  d.getElementById('tab-toggle').click(); await wait(150);
  check(cur() === 'bn-toggle', 'đổi tab bằng tab banner → thanh dưới sáng theo');
  d.querySelector('#side [data-side-tab="notify"]').click(); await wait(250);
  check(cur() === 'bn-notify', 'đổi tab bằng menu trái → thanh dưới sáng theo');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // CSS: chỉ cảm ứng / màn hẹp; web chuột giữ tab banner; không che menu trái
  const css = fs.readFileSync(path.join(ROOT, 'css', 'ui-polish.css'), 'utf8');
  const blk = css.slice(css.indexOf('/* ===== Thanh chức năng DƯỚI'));
  check(/@media \(max-width:760px\),\(hover:none\) and \(pointer:coarse\) and \(max-width:1099px\)\{/.test(blk), 'chỉ bật khi màn ≤ 760px hoặc thiết bị cảm ứng < 1100px (web dùng chuột ở màn rộng KHÔNG đổi)');
  check(/^\.bnav\{display:none\}/m.test(blk), 'ngoài điều kiện trên thì thanh dưới bị ẩn');
  check(/body \.banner \.tabs\{display:none\}/.test(blk), 'tab ở banner được ẩn khi dùng thanh dưới');
  check(/\.bnav\{[^}]*position:fixed;left:12px;right:12px;bottom:calc\(10px \+ env\(safe-area-inset-bottom/.test(blk) && /border-radius:28px/.test(blk), 'thanh NỔI dạng viên thuốc bo tròn: cách mép 12px, cách đáy 10px + vùng an toàn của thanh Home iPhone');
  check(/min-height:54px/.test(blk) && /backdrop-filter:blur\(18px\)/.test(blk), 'mỗi mục cao 54px (vùng chạm ≥ 44px); nền kính mờ');
  check(/z-index:23/.test(blk), 'thanh dưới nằm DƯỚI menu trái (26) và nền tối (25), không che chúng');
  check(/\.bnav button\[aria-current="page"\]\{color:#a31118\}/.test(blk) && /\.bnav button\[aria-current="page"\] svg\{[^}]*fill:rgba\(163,17,24,\.16\)/.test(blk) && /data-scene="night"\] \.bnav button\[aria-current="page"\]\{color:#f1c96b\}/.test(blk), 'mục đang chọn: đổi màu chữ + biểu tượng tô nhạt (đỏ sáng / vàng tối), không có nền khối');
  check(/body\{padding-bottom:96px\}/.test(blk) && !/fab-menu/.test(blk) && /\.toast\{bottom:calc\(100px/.test(blk), 'nội dung cách đáy 96px; thông báo nổi lên trên thanh dưới; không còn nút ☰ nổi');
  check(!d.getElementById('fab-menu') && !/fab-menu/.test(html), 'đã bỏ hẳn nút menu nổi (#fab-menu) khỏi trang');
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
