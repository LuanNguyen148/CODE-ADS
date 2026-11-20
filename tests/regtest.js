// jsdom: register flow in auth-feedback.js — token is verified with Facebook and stored with the account.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const src = fs.readFileSync(path.join(root, 'js/auth-feedback.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

function setup({ withSupabase, fbValid }) {
  const dom = new JSDOM(`<!doctype html><body>
    <form id="register-form"><input id="register-name" value="Shop Noel"><input id="register-email" value="Shop@Example.com">
      <input id="register-password" value="matkhau123"><input id="register-confirm" value="matkhau123"><input id="register-token" value="  EAAgoodtoken1234567890  ">
      <button type="submit">Đăng ký</button></form>
    <dialog id="auth-loading-dialog"><div class="auth-sleigh-sprite"><img></div><h2 id="auth-loading-title"></h2><p id="auth-loading-description"></p></dialog>
    <dialog id="auth-error-dialog"><h2 id="auth-error-title"></h2><p id="auth-error-description"></p><button id="auth-error-retry"></button><button id="auth-error-close"></button></dialog>
  </body>`, { url: 'http://localhost:5500/index.html', runScripts: 'outside-only' });
  const w = dom.window, calls = { fb: [], signUp: [] };
  w.OKLOGIN_SETTINGS = { feedback: { loadingMs: 0, errorMessage: 'Sai' } };
  w.OKLOGIN_CONFIG = {};
  w.ADS_IS_LOCAL_HOST = true;
  w.popupMotion = { show() {}, hide: async () => true };
  w.fetch = async url => { calls.fb.push(String(url)); return { json: async () => fbValid ? { id: '42', name: 'Chủ shop' } : { error: { message: 'Invalid OAuth access token.' } } }; };
  w.location.assign = () => {};
  if (withSupabase) w.sb = { auth: { getSession: async () => ({ data: { session: null } }), signUp: async args => { calls.signUp.push(args); return { data: { session: { user: {} } }, error: null }; } } };
  w.eval(src);
  return { w, calls };
}

(async () => {
  // 1) Token đúng + Supabase
  let { w, calls } = setup({ withSupabase: true, fbValid: true });
  w.showAuthFeedback(w.document.getElementById('register-form'));
  await wait(3000);
  check(calls.fb.length === 1 && calls.fb[0].startsWith('https://graph.facebook.com/v21.0/me?') && calls.fb[0].includes('access_token=EAAgoodtoken1234567890'), 'kiểm tra token với Facebook trước khi tạo tài khoản (đã bỏ khoảng trắng thừa)');
  check(calls.signUp.length === 1 && calls.signUp[0].options.data.fb_token === 'EAAgoodtoken1234567890', 'Supabase: token lưu kèm tài khoản (user_metadata.fb_token)');
  const sess = JSON.parse(w.localStorage.getItem('ads_auth_session_v1') || '{}');
  check(!sess.fbToken, 'Supabase: KHÔNG để token trong phiên của trình duyệt (proxy tự dùng)');

  // 2) Token sai + Supabase → không tạo tài khoản
  ({ w, calls } = setup({ withSupabase: true, fbValid: false }));
  w.showAuthFeedback(w.document.getElementById('register-form'));
  await wait(3000);
  check(calls.signUp.length === 0, 'token sai: KHÔNG tạo tài khoản');
  check(/Token Facebook không hợp lệ/.test(w.document.getElementById('auth-error-title').textContent) && /Invalid OAuth/.test(w.document.getElementById('auth-error-description').textContent), 'token sai: báo lỗi kèm lý do từ Facebook');

  // 3) Không Supabase (CDN/mạng lỗi): từ chối đăng ký, KHÔNG lưu tài khoản nào trên máy (đã gỡ phương án giả)
  ({ w, calls } = setup({ withSupabase: false, fbValid: true }));
  w.showAuthFeedback(w.document.getElementById('register-form'));
  await wait(3000);
  check(!w.localStorage.getItem('ads_auth_users_v1') && !w.localStorage.getItem('ads_auth_session_v1'), 'không Supabase: KHÔNG lưu tài khoản hay phiên đăng nhập nào');
  check(/Không thể kết nối hệ thống đăng nhập/.test(w.document.getElementById('auth-error-title').textContent), 'không Supabase: báo "Không thể kết nối hệ thống đăng nhập"');

  // 4) Kiểm tra định dạng ở form (app.js)
  const re = /field\.name === 'fbToken' && !(\/.+?\/)\.test/.exec(appSrc);
  const rx = re && eval(re[1]);
  check(rx && rx.test('EAA' + 'x'.repeat(60)) && !rx.test('abc123') && !rx.test('EAA short') && !rx.test('EAA' + 'x'.repeat(10)), 'form: chặn token sai định dạng (không bắt đầu EAA / quá ngắn / có khoảng trắng)');

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
})();
