// Mạng chập chờn / CDN không tải được thư viện Supabase: dashboard KHÔNG được tự đăng xuất người dùng
// (trước đây xóa phiên rồi đẩy về trang đăng nhập → lần sau phải nhập lại mật khẩu dù đã tick ghi nhớ).
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(path.resolve(process.argv[2]));
const wait = ms => new Promise(r => setTimeout(r, ms));
class Loader extends ResourceLoader {
  fetch(url) {
    if (/jsdelivr|googleapis|gstatic/.test(url)) return Promise.resolve(Buffer.from('')); // CDN Supabase không tải được
    const m = url.match(/^https:\/\/adscgd\.example\/([^?#]*)/);
    if (m) { const f = path.join(ROOT, decodeURIComponent(m[1])); return fs.existsSync(f) ? Promise.resolve(fs.readFileSync(f)) : Promise.reject(new Error('404')); }
    return Promise.resolve(Buffer.from(''));
  }
}
(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const nav = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (/navigation/i.test(String(e.message || e))) nav.push(1); });
  const dom = new JSDOM(fs.readFileSync(process.argv[2], 'utf8'), {
    url: 'https://adscgd.example/dashboard.html', runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'shop@example.com', name: 'Shop' }));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  await wait(1500);
  const w = dom.window, d = w.document;
  check(!!w.localStorage.getItem('ads_auth_session_v1'), 'không tải được thư viện Supabase → KHÔNG xóa phiên đăng nhập');
  check(nav.length === 0, 'không tự đẩy về trang đăng nhập');
  const box = d.getElementById('ads-offline');
  check(box && /kết nối/i.test(box.textContent) && !!box.querySelector('button'), 'hiện thông báo lỗi kết nối kèm nút "Tải lại trang"');
  check(d.documentElement.classList.contains('ads-auth-pending'), 'nội dung dashboard vẫn bị ẩn (chưa xác minh được phiên)');
  w.close();
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
