// jsdom: list headings no longer include the (very long) ad account name.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ACC = 'HAI 7 - 2026 (685960921048031) - TO VAN HAI - 001097026912 (724436746683608)';
(async () => {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt' }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_685960921048031', accountName: ACC + ' (685960921048031 - Hoạt động)' }));
      w.matchMedia = q => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(400);
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const head = () => d.getElementById('hier-heading').textContent;
  check(head() === '1. Chiến dịch', 'tab Chiến dịch: "' + head() + '"');
  d.querySelector('[data-htab="adset"]').click(); await wait(50);
  check(head() === '2. Tất cả Nhóm quảng cáo', 'tab Nhóm QC: "' + head() + '"');
  d.querySelector('[data-htab="ad"]').click(); await wait(50);
  check(head() === '3. Tất cả Quảng cáo', 'tab Quảng cáo: "' + head() + '"');
  check(!/685960921048031|TO VAN HAI/.test(d.querySelector('.bar').textContent + d.getElementById('hier-crumb').textContent), 'tiêu đề và thanh đường dẫn không còn tên tài khoản quảng cáo');
  check(d.getElementById('hier-heading').title === head(), 'rê chuột vào tiêu đề xem được tên đầy đủ');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  w.close();
})();
