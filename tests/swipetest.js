// Điện thoại: gạt từ trái sang phải → mở menu chức năng; gạt ngược lại khi đang mở → đóng.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

function open(desktop) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      Object.defineProperty(w, 'innerWidth', { value: desktop ? 1400 : 390, configurable: true });
      w.matchMedia = q => ({ matches: desktop && /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  return { dom, errors };
}
// Giả lập cú gạt: touchstart tại (x0,y0) trên phần tử el, touchend tại (x1,y1)
function swipe(w, el, x0, y0, x1, y1) {
  const mk = (type, x, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); const t = { clientX: x, clientY: y, target: el }; Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [t] }); Object.defineProperty(e, 'changedTouches', { value: [t] }); return e; };
  el.dispatchEvent(mk('touchstart', x0, y0)); el.dispatchEvent(mk('touchend', x1, y1));
}

(async () => {
  let { dom, errors } = open(false);
  let w = dom.window, d = w.document;
  await wait(700);
  const side = d.getElementById('side'), isOpen = () => side.classList.contains('open');
  const body = d.getElementById('v-day') || d.body;
  check(!isOpen(), 'lúc đầu menu đóng');
  swipe(w, body, 20, 400, 60, 400); await wait(50);
  check(!isOpen(), 'gạt quá ngắn (40px) → KHÔNG mở');
  swipe(w, body, 100, 400, 190, 600); await wait(50);
  check(!isOpen(), 'gạt chéo (xuống nhiều hơn ngang) → KHÔNG mở (đang cuộn trang)');
  swipe(w, body, 200, 400, 100, 400); await wait(50);
  check(!isOpen(), 'gạt từ phải sang trái khi menu đang đóng → KHÔNG mở');
  swipe(w, body, 30, 400, 160, 410); await wait(50);
  check(isOpen(), 'gạt từ trái sang phải (130px, gần như ngang) → MỞ menu chức năng');
  check(d.querySelector('#fab-menu').getAttribute('aria-expanded') === 'true', 'nút ☰ báo aria-expanded="true" khi mở bằng cử chỉ');
  swipe(w, side, 250, 400, 240, 400); await wait(50);
  check(isOpen(), 'gạt trái quá ngắn khi menu mở → vẫn mở');
  swipe(w, side, 260, 400, 120, 395); await wait(50);
  check(!isOpen() && d.querySelector('#fab-menu').getAttribute('aria-expanded') === 'false', 'gạt từ phải sang trái khi menu mở → ĐÓNG menu');
  // không kích hoạt khi bắt đầu từ ô nhập hoặc nút ☰ (kéo nút) hoặc đang mở hộp thoại
  const inp = d.getElementById('t1'); swipe(w, inp, 30, 400, 200, 400); await wait(50);
  check(!isOpen(), 'bắt đầu gạt từ ô nhập → KHÔNG mở (người dùng đang chọn chữ)');
  swipe(w, d.getElementById('fab-menu'), 30, 700, 200, 700); await wait(50);
  check(!isOpen(), 'bắt đầu từ nút ☰ (kéo nút) → KHÔNG mở bằng cử chỉ');
  const dlg = d.createElement('dialog'); d.body.appendChild(dlg); dlg.setAttribute('open', ''); swipe(w, body, 30, 400, 200, 400); await wait(50);
  check(!isOpen(), 'đang mở hộp thoại → KHÔNG mở menu'); dlg.remove();
  // vùng tự cuộn ngang (bảng/dải tab) thì để nó cuộn
  const strip = d.createElement('div'); strip.style.cssText = 'overflow-x:auto;width:100px'; const inner = d.createElement('div'); inner.style.width = '1000px'; strip.appendChild(inner); d.body.appendChild(strip);
  Object.defineProperty(strip, 'scrollWidth', { value: 1000 }); Object.defineProperty(strip, 'clientWidth', { value: 100 });
  swipe(w, inner, 20, 300, 200, 300); await wait(50);
  check(!isOpen(), 'bắt đầu gạt trong vùng tự cuộn ngang → KHÔNG mở (để vùng đó cuộn)'); strip.remove();
  // mở bằng cử chỉ rồi chọn tab vẫn hoạt động
  swipe(w, body, 30, 400, 160, 400); await wait(50);
  d.querySelector('#side [data-side-tab="toggle"]').click(); await wait(300);
  check(!isOpen() && d.getElementById('tab-toggle').getAttribute('aria-selected') === 'true', 'mở menu bằng cử chỉ → chọn tab → tab đổi và menu tự đóng');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // Máy tính (màn rộng): cử chỉ không làm gì, menu luôn hiện
  ({ dom, errors } = open(true)); w = dom.window; d = w.document; await wait(700);
  const before = d.getElementById('side').className;
  swipe(w, d.body, 30, 400, 200, 400); await wait(50);
  check(d.getElementById('side').className === before, 'màn rộng (máy tính): cử chỉ gạt KHÔNG đổi gì');
  check(errors.length === 0, 'không lỗi JavaScript (màn rộng)' + (errors.length ? ': ' + errors[0] : '')); w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
