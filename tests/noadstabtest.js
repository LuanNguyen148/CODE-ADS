// Đã bỏ tab "Tổng theo bài" (người dùng yêu cầu: trùng với Báo cáo ngày ở cấp Quảng cáo khi xem khoảng ngày).
// Phải: không còn nút/phần/mã của tab; tab đã lưu là "ads" tự về Báo cáo ngày; các tab còn lại vẫn chạy và phím mũi tên không nhảy vào tab đã bỏ.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

function boot(savedTab) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      if (savedTab) w.localStorage.setItem('ads-eval-v1-s@e.com', JSON.stringify({ t1: 25, t2: 35, tab: savedTab, byAcc: {} }));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  return { dom, errors };
}

(async () => {
  let { dom, errors } = boot();
  let w = dom.window, d = w.document;
  await wait(700);
  check(!d.getElementById('tab-ads') && !d.querySelector('[data-tab="ads"]'), 'không còn nút tab "Tổng theo bài" trên banner');
  check(!d.querySelector('#side [data-side-tab="ads"]'), 'không còn mục "Tổng theo bài" ở menu trái');
  check(!d.getElementById('v-ads') && !d.getElementById('atab') && !d.getElementById('acopy'), 'không còn phần nội dung của tab (v-ads, bảng #atab, nút sao chép)');
  const scripts = [...d.querySelectorAll('script')].map(s => s.textContent).join('\n');
  check(!/function renderAds|function adsData|function sortAds|function adsText/.test(scripts), 'đã gỡ mã vẽ/tính của tab (renderAds, adsData, sortAds, adsText)');
  const labels = [...d.querySelectorAll('#side [data-side-tab]')].map(b => b.dataset.sideTab).join(',');
  check(labels === 'day,days,toggle,notify,settings', 'menu trái còn đúng: Báo cáo ngày, Tổng theo ngày, Bật/Tắt, Thông báo, Cài đặt (thực tế: ' + labels + ')');

  // Đi qua các tab còn lại, không lỗi; Tổng theo ngày dùng khoảng ngày như cũ
  for (const t of ['days', 'toggle', 'settings', 'day', 'days']) { d.querySelector('#side [data-side-tab="' + t + '"]').click(); await wait(80); }
  check(!d.getElementById('v-days').hidden && d.getElementById('v-toggle').hidden, 'các tab còn lại vẫn chuyển được (Tổng theo ngày đang mở)');
  // Phím mũi tên trên thanh tab: từ "Tổng theo ngày" sang phải phải tới "Bật/Tắt" (không qua tab đã bỏ)
  d.getElementById('tab-days').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(80);
  check(!d.getElementById('v-toggle').hidden, 'phím → từ Tổng theo ngày tới Bật/Tắt (không nhảy vào tab đã bỏ)');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // Máy đã từng lưu tab "ads" (hoặc cloud còn giá trị cũ) → mở lại tự về Báo cáo ngày, không trang trắng
  ({ dom, errors } = boot('ads'));
  w = dom.window; d = w.document; await wait(700);
  check(!d.getElementById('v-day').hidden && d.documentElement.getAttribute('data-tab') === 'day', 'đã lưu tab "ads" → mở lại tự về Báo cáo ngày (data-tab=' + d.documentElement.getAttribute('data-tab') + ')');
  check(errors.length === 0, 'mở với tab cũ "ads" không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
