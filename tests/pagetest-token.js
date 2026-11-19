// jsdom: dashboard without token UI; token comes from the logged-in account; logout clears it.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const gets = [];
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/navigation|Not implemented/i.test(String(e.message || e))) errors.push(String(e.message || e)); });
const dom = new JSDOM(html, {
  url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.ADS_LOCAL_SESSION = true; // giả lập phiên test local hợp lệ (supabase-client.js không chạy trong jsdom)
    // Phiên đăng nhập (chế độ không Supabase) mang token của tài khoản
    w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'shop@example.com', name: 'Shop', fbToken: 'EAAaccounttoken' }));
    // Token cũ do tính năng "Cấu hình Token" để lại
    w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ token: 'EAAoldtoken', accountId: 'act_1', accountName: 'TK 1' }));
    w.localStorage.setItem('ads_fb_config_v3', JSON.stringify({ token: 'EAAoldv3' }));
    w.matchMedia = q => ({ matches: /min-width:1100px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.IntersectionObserver = class { observe() {} disconnect() {} };
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.scrollTo = () => {};
    if (w.HTMLDialogElement) w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.fetch = (url, opts) => {
      url = String(url); if (!opts || opts.method !== 'POST') gets.push(url);
      const data = /\/me\/adaccounts/.test(url) ? { data: [{ account_id: '1', name: 'TK 1', account_status: 1, currency: 'VND' }] } : { data: [] };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve('') });
    };
  },
});
const w = dom.window, d = w.document;
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
(async () => {
  await wait(500);
  check(errors.length === 0, 'trang tải không lỗi JavaScript' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
  check(!d.getElementById('fb-toggle-token') && !d.getElementById('fb-adv') && !d.querySelector('.hier-nav #fb-token-input') && !!d.getElementById('acct-dialog').querySelector('#fb-token-input'), 'ô token chỉ nằm trong cửa sổ Tài khoản');
  const cfg = JSON.parse(w.localStorage.getItem('ads_fb_config_v4') || '{}');
  check(!('token' in cfg) && cfg.accountId === 'act_1', 'dọn token cũ trong bộ nhớ trình duyệt, vẫn nhớ TKQC đang chọn');
  check(w.localStorage.getItem('ads_fb_config_v3') === null, 'xóa luôn cấu hình token bản cũ (v3)');
  const tokens = gets.map(u => { try { return new URL(u).searchParams.get('access_token'); } catch (e) { return null; } }).filter(Boolean);
  check(tokens.length > 0 && tokens.every(t => t === 'EAAaccounttoken'), 'gọi Facebook bằng token của tài khoản đang đăng nhập (' + tokens.length + ' lần), không dùng token cũ');

  // Đăng xuất qua popup Giáng sinh
  w.eval(fs.readFileSync(path.join(root, 'js/logout-popup.js'), 'utf8'));
  w.ADS_LOGOUT_POPUP.open();
  await wait(3400);
  check(w.localStorage.getItem('ads_auth_session_v1') === null, 'đăng xuất: xóa phiên đăng nhập (gồm token)');
  const cfg2 = JSON.parse(w.localStorage.getItem('ads_fb_config_v4') || '{}');
  check(!('token' in cfg2), 'đăng xuất: không còn token nào trong bộ nhớ trình duyệt');
  const dump = JSON.stringify(Object.keys(w.localStorage).map(k => w.localStorage.getItem(k)));
  check(!/EAA/.test(dump), 'đăng xuất: quét toàn bộ localStorage không còn chuỗi token "EAA…"');
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  w.close();
})();
