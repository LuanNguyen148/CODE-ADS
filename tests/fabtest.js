// Điện thoại: bỏ thanh nổi (minibar), thay bằng nút menu ☰ tròn luôn hiện, kéo đi đâu cũng được, nhớ vị trí; chạm thì mở menu trái.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

function open(pos) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      if (pos) w.localStorage.setItem('ads_fab_pos_v1', pos);
      Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
      Object.defineProperty(w, 'innerHeight', { value: 800, configurable: true });
      w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  return { dom, errors };
}
const pe = (w, type, x, y) => new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });

(async () => {
  let { dom, errors } = open();
  let w = dom.window, d = w.document;
  await wait(600);
  check(!d.getElementById('mini-bar'), 'đã bỏ thanh nổi #mini-bar');
  const fab = d.getElementById('fab-menu');
  check(fab && fab.tagName === 'BUTTON' && /menu/i.test(fab.getAttribute('aria-label') || ''), 'có nút menu nổi #fab-menu (button, có nhãn "Mở menu")');
  check(fab && fab.getAttribute('aria-controls') === 'side', 'nút điều khiển menu trái (aria-controls="side")');

  // Chạm (không kéo) → mở menu trái
  fab.dispatchEvent(pe(w, 'pointerdown', 340, 700)); fab.dispatchEvent(pe(w, 'pointerup', 340, 700)); fab.click(); await wait(50);
  check(d.getElementById('side').classList.contains('open'), 'chạm nút → mở menu trái');
  check(fab.getAttribute('aria-expanded') === 'true', 'nút báo aria-expanded="true" khi menu mở');
  d.getElementById('side-scrim').click(); await wait(50);
  check(!d.getElementById('side').classList.contains('open') && fab.getAttribute('aria-expanded') === 'false', 'bấm nền tối → đóng menu, nút về aria-expanded="false"');

  // Kéo → đổi vị trí, không mở menu, nhớ vị trí
  fab.dispatchEvent(pe(w, 'pointerdown', 340, 700));
  w.dispatchEvent(pe(w, 'pointermove', 300, 600)); w.dispatchEvent(pe(w, 'pointermove', 200, 300));
  w.dispatchEvent(pe(w, 'pointerup', 200, 300)); fab.click(); await wait(50);
  check(!d.getElementById('side').classList.contains('open'), 'kéo xong không tự mở menu');
  check(fab.style.left !== '' && fab.style.top !== '', 'nút đã dời chỗ theo ngón tay (left=' + fab.style.left + ', top=' + fab.style.top + ')');
  const saved = w.localStorage.getItem('ads_fab_pos_v1');
  check(!!saved, 'nhớ vị trí nút (ads_fab_pos_v1 = ' + saved + ')');
  // Kéo ra ngoài màn hình → bị giữ lại trong màn hình
  fab.dispatchEvent(pe(w, 'pointerdown', 200, 300)); w.dispatchEvent(pe(w, 'pointermove', 900, -500)); w.dispatchEvent(pe(w, 'pointerup', 900, -500)); await wait(20);
  const L = parseFloat(fab.style.left), T = parseFloat(fab.style.top);
  check(L >= 0 && L <= 390 - 40 && T >= 0, 'kéo ra ngoài vẫn nằm trong màn hình (left=' + L + ', top=' + T + ')');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // Mở lại trang → nút ở đúng vị trí đã kéo
  ({ dom, errors } = open(JSON.stringify({ x: 0.5, y: 0.25 })));
  w = dom.window; d = w.document; await wait(600);
  const f2 = d.getElementById('fab-menu');
  check(f2.style.left !== '' && f2.style.top !== '', 'mở lại trang: nút ở vị trí đã lưu (left=' + f2.style.left + ', top=' + f2.style.top + ')');
  w.close();

  // CSS: chỉ hiện dưới 1100px, cố định trên màn hình, kéo bằng cảm ứng không cuộn trang
  const dir = path.dirname(path.resolve(process.argv[2]));
  const css = html.match(/<style>([\s\S]*?)<\/style>/g).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  check(/\.fab-menu\s*{[^}]*position:\s*fixed/.test(css) && /\.fab-menu\s*{[^}]*touch-action:\s*none/.test(css), '.fab-menu: position:fixed + touch-action:none');
  check(/@media \(min-width:1100px\)\s*{[^@]*\.fab-menu\s*{\s*display:\s*none/.test(css), 'máy tính (>=1100px) ẩn nút nổi (menu trái luôn hiện)');
  check(!/\.mini-bar\b/.test(css), 'đã gỡ CSS của thanh nổi');
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
