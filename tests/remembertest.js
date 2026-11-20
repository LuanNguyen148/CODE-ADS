// Ghi nhớ đăng nhập: chạy code thật (js/config.js + js/supabase-client.js + js/auth-feedback.js) với thư viện Supabase giả.
// Lỗi cũ (thấy trong nhật ký Supabase): phiên Supabase còn hiệu lực nhưng trang đăng nhập vẫn bắt nhập mật khẩu,
// vì trang chỉ nhìn cờ riêng "ads_auth_session_v1" (mất khi đóng tab nếu chưa tick ghi nhớ), không hỏi Supabase.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

// Thư viện Supabase giả: phiên lưu trong đúng "storage" mà trang cấu hình cho client
function fakeLib(log, w) {
  return { createClient(url, key, opts) {
    const st = (opts && opts.auth && opts.auth.storage) || w.localStorage; // giống supabase-js: mặc định localStorage
    log.push(st);
    const get = () => { try { return JSON.parse((st || {}).getItem ? st.getItem('fake-sb-session') : 'null'); } catch (e) { return null; } };
    return { auth: {
      getSession: async () => ({ data: { session: get() } }),
      signInWithPassword: async ({ email }) => { const s = { access_token: 'jwt', user: { email, user_metadata: { name: 'Chủ shop' } } }; st.setItem('fake-sb-session', JSON.stringify(s)); return { data: { user: s.user, session: s }, error: null }; },
      signOut: async () => { st.removeItem('fake-sb-session'); return {}; },
    } };
  } };
}
const PAGE = `<!doctype html><body>
  <form id="login-form"><input id="login-email" name="email" value="Shop@Example.com"><input id="login-password" value="matkhau123">
    <input id="login-remember" type="checkbox"><button type="submit">Đăng nhập</button></form>
  <dialog id="auth-loading-dialog"><div class="auth-sleigh-sprite"><img></div><h2 id="auth-loading-title"></h2><p id="auth-loading-description"></p></dialog>
  <dialog id="auth-error-dialog"><h2 id="auth-error-title"></h2><p id="auth-error-description"></p><button id="auth-error-retry"></button><button id="auth-error-close"></button></dialog>
</body>`;
function open(prev) {
  const nav = [], log = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (/navigation/i.test(String(e.message || e))) nav.push(e.message); });
  const dom = new JSDOM(PAGE, { url: 'https://adscgd.example/index.html', runScripts: 'outside-only', virtualConsole: vc });
  const w = dom.window;
  for (const [k, v] of Object.entries((prev && prev.local) || {})) w.localStorage.setItem(k, v);
  for (const [k, v] of Object.entries((prev && prev.session) || {})) w.sessionStorage.setItem(k, v);
  w.supabase = fakeLib(log, w);
  w.popupMotion = { show() {}, hide: async () => true };
  w.eval(read('js/config.js'));
  w.OKLOGIN_SETTINGS.feedback.loadingMs = 0;
  w.eval(read('js/supabase-client.js'));
  w.eval(read('js/auth-feedback.js'));
  return { w, nav, log };
}
const dump = s => { const o = {}; for (let i = 0; i < s.length; i++) o[s.key(i)] = s.getItem(s.key(i)); return o; };
const login = async (w, remember) => { w.document.getElementById('login-remember').checked = remember; w.showAuthFeedback(w.document.getElementById('login-form')); await wait(1700); };

(async () => {
  // 1) Có tick ghi nhớ → cả phiên Supabase lẫn cờ của web đều lưu lâu dài (localStorage)
  let { w, nav, log } = open();
  await login(w, true);
  check(!!w.localStorage.getItem('fake-sb-session') && !!w.localStorage.getItem('ads_auth_session_v1'), 'có tick: phiên Supabase + cờ đăng nhập đều lưu lâu dài');
  let saved = { local: dump(w.localStorage), session: {} }; // đóng trình duyệt: mất sessionStorage
  w.close();
  ({ w, nav } = open(saved)); await wait(300);
  check(nav.length > 0, 'có tick: mở lại web → tự vào thẳng dashboard, không phải nhập mật khẩu');
  w.close();

  // 2) Không tick → đóng trình duyệt là đăng xuất (Supabase cũng không giữ phiên lâu dài)
  ({ w, nav, log } = open());
  await login(w, false);
  check(!w.localStorage.getItem('fake-sb-session') && !!w.sessionStorage.getItem('fake-sb-session'), 'không tick: phiên Supabase chỉ giữ trong phiên trình duyệt (sessionStorage)');
  check(!w.localStorage.getItem('ads_auth_session_v1') && !!w.sessionStorage.getItem('ads_auth_session_v1'), 'không tick: cờ đăng nhập chỉ trong phiên trình duyệt');
  saved = { local: dump(w.localStorage), session: dump(w.sessionStorage) };
  w.close();
  ({ w, nav } = open({ local: saved.local, session: saved.session })); await wait(300); // F5 / mở tab trong cùng phiên
  check(nav.length > 0, 'không tick: tải lại trang trong cùng phiên → vẫn đăng nhập');
  w.close();
  ({ w, nav } = open({ local: saved.local })); await wait(300); // đóng trình duyệt
  check(nav.length === 0, 'không tick: đóng trình duyệt rồi mở lại → phải đăng nhập lại (đúng ý "không ghi nhớ")');
  w.close();

  // 3) Lỗi cũ: phiên Supabase còn hạn nhưng thiếu cờ "ads_auth_session_v1" → trước đây hiện form đăng nhập
  ({ w, nav } = open({ local: { 'fake-sb-session': JSON.stringify({ access_token: 'jwt', user: { email: 'shop@example.com', user_metadata: { name: 'Chủ shop' } } }) } }));
  await wait(300);
  const s = JSON.parse(w.localStorage.getItem('ads_auth_session_v1') || w.sessionStorage.getItem('ads_auth_session_v1') || 'null');
  check(nav.length > 0 && s && s.email === 'shop@example.com', 'phiên Supabase còn hạn mà thiếu cờ web → khôi phục cờ và vào thẳng dashboard');
  w.close();

  // 4) Không có phiên Supabase nào → ở lại trang đăng nhập
  ({ w, nav } = open()); await wait(300);
  check(nav.length === 0, 'chưa đăng nhập → ở lại trang đăng nhập');
  w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
