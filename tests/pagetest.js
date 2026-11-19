// Load the real dashboard.html in jsdom with a mocked Facebook API and exercise:
// toggle tab list + ad thumbnails, new notifications, Undo, sticky error.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

const posts = [];
let postReply = () => ({ success: true });
function fbData(url) {
  if (/\/me\/adaccounts/.test(url)) return { data: [{ account_id: '1', name: 'TK 1', account_status: 1, currency: 'VND' }] };
  if (/\/act_1\/campaigns\?/.test(url)) return { data: [{ id: 'C1', name: 'Camp Noel', status: 'ACTIVE' }, { id: 'C2', name: 'Camp chưa tiêu', status: 'PAUSED' }] };
  if (/\/act_1\/adsets\?/.test(url)) return { data: [{ id: 'A1', name: 'Set 1', status: 'ACTIVE', campaign_id: 'C1' }] };
  if (/\/act_1\/ads\?/.test(url)) return { data: [
    { id: 'AD1', name: 'QC có ảnh', status: 'ACTIVE', campaign_id: 'C1', adset_id: 'A1', creative: { id: 'CR1', thumbnail_url: 'https://scontent.example/thumb1.jpg' } },
    { id: 'AD2', name: 'QC không ảnh', status: 'PAUSED', campaign_id: 'C1', adset_id: 'A1' },
  ] };
  return { data: [] };
}
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.message || e)));
vc.on('error', e => errors.push('console.error: ' + e));

const dom = new JSDOM(html, {
  url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.ADS_LOCAL_SESSION = true; // giả lập phiên test local hợp lệ (supabase-client.js không chạy trong jsdom)
    w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'test', name: 'Tester', fbToken: 'TK' }));
    w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ token: 'TK', accountId: 'act_1', accountName: 'TK 1' }));
    w.matchMedia = q => ({ matches: /min-width:1100px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.IntersectionObserver = class { observe() {} disconnect() {} };
    w.ResizeObserver = class { observe() {} disconnect() {} };
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.scrollTo = () => {};
    w.HTMLDialogElement && (w.HTMLDialogElement.prototype.showModal = function () { this.open = true; });
    w.fetch = (url, opts) => {
      url = String(url);
      if (opts && opts.method === 'POST') { posts.push({ url, body: opts.body }); return Promise.resolve({ json: () => Promise.resolve(postReply()) }); }
      return Promise.resolve({ json: () => Promise.resolve(fbData(url)) });
    };
  },
});
const w = dom.window, d = w.document;
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
const toasts = () => [...d.querySelectorAll('#nt-stack .nt')];

(async () => {
  await wait(400);
  check(errors.length === 0, 'trang tải không có lỗi JavaScript' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));

  d.querySelector('#side [data-side-tab="toggle"]').click();
  await wait(300);
  const list = d.getElementById('tg-list');
  check(!d.getElementById('v-toggle').hidden, 'bấm menu trái "Bật / Tắt quảng cáo" → mở đúng tab');
  check(/Camp chưa tiêu/.test(list.innerHTML), 'tab Bật/Tắt hiện cả chiến dịch chưa tiêu tiền');

  d.querySelector('#tg-lvl-tabs [data-lvl="ad"]').click();
  await wait(50);
  const img = list.querySelector('.ad-thumb[data-thumb-ad="AD1"] img');
  check(img && img.getAttribute('src') === 'https://scontent.example/thumb1.jpg' && img.getAttribute('referrerpolicy') === 'no-referrer', 'QC có ảnh: hiện ảnh thu nhỏ từ Facebook');
  check(list.querySelector('.ad-thumb.is-empty[data-thumb-ad="AD2"]'), 'QC không ảnh: hiện ô cây thông');

  // Tắt AD1 → thông báo thành công có nút Hoàn tác
  const cb = list.querySelector('input[data-tg-id="AD1"]');
  cb.checked = false; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  await wait(100);
  let t = toasts()[0];
  check(posts.length === 1 && posts[0].body === 'status=PAUSED' && /\/AD1\?/.test(posts[0].url), 'tắt QC → gửi status=PAUSED');
  check(t && t.classList.contains('nt-success') && /Đã TẠM DỪNG “QC có ảnh”/.test(t.textContent), 'thông báo thành công ghi rõ tên quảng cáo');
  check(t && t.querySelector('.nt-act') && t.querySelector('.nt-act').textContent === 'Hoàn tác', 'có nút "Hoàn tác"');
  check(t && t.getAttribute('role') === 'status', 'thông báo thường: role=status (đọc nhẹ nhàng)');

  t.querySelector('.nt-act').click();
  await wait(400);
  check(posts.length === 2 && posts[1].body === 'status=ACTIVE', 'bấm Hoàn tác → gửi lại status=ACTIVE');
  t = toasts()[0];
  check(t && /Đã hoàn tác: BẬT lại “QC có ảnh”/.test(t.textContent) && !t.querySelector('.nt-act'), 'thông báo hoàn tác, không có nút Hoàn tác lặp lại');

  // Lỗi Facebook → thông báo lỗi không tự tắt
  postReply = () => ({ error: { message: 'Không đủ quyền' } });
  const cb2 = list.querySelector('input[data-tg-id="AD2"]');
  cb2.checked = true; cb2.dispatchEvent(new w.Event('change', { bubbles: true }));
  await wait(100);
  t = toasts()[0];
  check(t && t.classList.contains('nt-error') && t.classList.contains('sticky') && t.getAttribute('role') === 'alert', 'lỗi: thẻ đỏ, role=alert, không tự tắt');
  check(t && /Không đủ quyền/.test(t.textContent), 'lỗi: hiện nội dung lỗi Facebook');

  // Tối đa 3 thông báo
  for (let i = 0; i < 3; i++) d.getElementById('tg-refresh-btn').click(), await wait(60);
  check(toasts().length <= 3, 'xếp chồng tối đa 3 thông báo (đang có ' + toasts().length + ')');

  // Nút đóng
  const n0 = toasts().length; toasts()[0].querySelector('.nt-x').click(); await wait(300);
  check(toasts().length === n0 - 1, 'nút ✕ đóng thông báo');

  check(errors.length === 0, 'không phát sinh lỗi JavaScript trong lúc thao tác' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  w.close();
})();
