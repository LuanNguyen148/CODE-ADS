// Tab "Cài đặt": giao diện Sáng / Tối / Tự động, bật tắt tuyết rơi, đổi mật khẩu.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(path.resolve(process.argv[2]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const EMAIL = 'shop@example.com';

class Loader extends ResourceLoader {
  fetch(url) {
    if (/jsdelivr|googleapis|gstatic/.test(url)) return Promise.resolve(Buffer.from(''));
    const m = url.match(/^http:\/\/localhost:5500\/([^?#]*)/);
    if (m) { const f = path.join(ROOT, decodeURIComponent(m[1])); return fs.existsSync(f) ? Promise.resolve(fs.readFileSync(f)) : Promise.reject(new Error('404 ' + m[1])); }
    return Promise.resolve(Buffer.from(''));
  }
}
// mode 'sb' = có Supabase giả (đổi mật khẩu được); 'local' = tài khoản test local
function boot({ mode, local, hour, pwErr }) {
  const errors = [], authCalls = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { const m = String(e.message || e); if (!/navigation|Not implemented/i.test(m)) errors.push(m); });
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8'), {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (mode === 'local') w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: EMAIL, name: 'Shop', local: mode === 'local' }));
      for (const [k, v] of Object.entries(local || {})) w.localStorage.setItem(k, v);
      if (hour != null) { const R = w.Date; w.Date = class extends R { constructor(...a) { if (a.length) super(...a); else { super(); this.setHours(hour); } } }; }
      w.supabase = { createClient() { return {
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u1', email: EMAIL }, access_token: 't' } } }),
          signInWithPassword: async a => { authCalls.push(['signIn', a]); return a.password === 'matkhaucu1' ? { data: { user: { email: EMAIL } }, error: null } : { data: null, error: { message: 'Invalid login credentials' } }; },
          updateUser: async a => { authCalls.push(['update', a]); return a.password ? (pwErr ? { error: { message: pwErr } } : { data: {}, error: null }) : { data: {}, error: null }; },
          signOut: async () => ({}),
        },
        from() { return { select() { return { maybeSingle: async () => ({ data: null, error: null }) }; }, upsert: async () => ({ error: null }) }; },
      }; } };
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }), text: () => Promise.resolve('') });
    },
  });
  return { w: dom.window, d: dom.window.document, errors, authCalls };
}

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const sceneByHour = h => (h >= 6 && h < 18) ? 'day' : 'night';

  // ===== A) Tab Cài đặt + giao diện + tuyết (tài khoản test local) =====
  let { w, d, errors } = boot({ mode: 'local', hour: 10 });
  await wait(700);
  const q = s => [...d.querySelectorAll(s)];
  check(!!d.querySelector('#side [data-side-tab="settings"]') && !!d.getElementById('tab-settings'), 'có mục "Cài đặt" ở menu trái và tab trên banner');
  check(d.getElementById('v-settings').hidden, 'chưa bấm thì tab Cài đặt ẩn');
  d.querySelector('#side [data-side-tab="settings"]').click();
  await wait(100);
  check(!d.getElementById('v-settings').hidden && d.getElementById('v-day').hidden, 'bấm "Cài đặt" → hiện Cài đặt, ẩn Báo cáo ngày');
  check(d.documentElement.dataset.scene === 'day', 'mặc định "Tự động": 10 giờ → giao diện Sáng');
  const themeBtn = t => d.querySelector('[data-theme="' + t + '"]');
  check(themeBtn('auto').getAttribute('aria-checked') === 'true', 'nút "Tự động" đang được chọn');
  themeBtn('night').click();
  check(d.documentElement.dataset.scene === 'night' && w.localStorage.getItem('ads_theme_v1') === 'night' && themeBtn('night').getAttribute('aria-checked') === 'true' && themeBtn('auto').getAttribute('aria-checked') === 'false', 'chọn "Tối" → đổi ngay sang giao diện Tối, nhớ lựa chọn');
  await wait(1300);
  check(d.documentElement.dataset.scene === 'night', 'đồng hồ cập nhật mỗi giây không ghi đè lựa chọn "Tối" của người dùng');
  themeBtn('day').click();
  check(d.documentElement.dataset.scene === 'day' && w.localStorage.getItem('ads_theme_v1') === 'day', 'chọn "Sáng" → giao diện Sáng');
  themeBtn('auto').click();
  check(d.documentElement.dataset.scene === sceneByHour(10) && w.localStorage.getItem('ads_theme_v1') === 'auto', 'chọn "Tự động" → quay về theo giờ');

  const snow = d.getElementById('set-snow');
  check(snow && snow.checked && !d.documentElement.classList.contains('no-snow'), 'tuyết rơi: mặc định bật');
  snow.checked = false; snow.dispatchEvent(new w.Event('change', { bubbles: true }));
  check(d.documentElement.classList.contains('no-snow') && w.localStorage.getItem('ads_snow_v1') === '0', 'tắt tuyết rơi → ẩn hiệu ứng, nhớ lựa chọn');
  snow.checked = true; snow.dispatchEvent(new w.Event('change', { bubbles: true }));
  check(!d.documentElement.classList.contains('no-snow') && w.localStorage.getItem('ads_snow_v1') === '1', 'bật lại tuyết rơi');

  // Tài khoản test local không có mật khẩu Supabase
  const f0 = d.getElementById('pw-form');
  check(f0 && [...f0.querySelectorAll('input,button')].every(x => x.disabled) && /test local/i.test(d.getElementById('pw-note').textContent), 'tài khoản test local: form đổi mật khẩu bị khóa, có giải thích');
  check(errors.length === 0, 'không lỗi JavaScript (local)' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // ===== B) Nhớ lựa chọn khi mở lại trang =====
  ({ w, d, errors } = boot({ mode: 'local', hour: 10, local: { ads_theme_v1: 'night', ads_snow_v1: '0' } }));
  check(d.documentElement.dataset.scene === 'night' && d.documentElement.classList.contains('no-snow'), 'mở lại trang: giữ giao diện Tối + tắt tuyết ngay từ đầu (không chớp sáng)');
  await wait(700);
  d.querySelector('#side [data-side-tab="settings"]').click();
  check(d.querySelector('[data-theme="night"]').getAttribute('aria-checked') === 'true' && !d.getElementById('set-snow').checked, 'trang Cài đặt hiện đúng lựa chọn đã lưu');
  w.close();

  // ===== C) Đổi mật khẩu (Supabase) =====
  ({ w, d, errors, authCalls: _ } = Object.assign(boot({ mode: 'sb', hour: 10 }), {}));
  const calls = () => _;
  await wait(900);
  d.querySelector('#side [data-side-tab="settings"]').click();
  await wait(100);
  const setv = (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = async () => { d.getElementById('pw-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(250); };
  const err = () => d.getElementById('pw-err').hidden ? '' : d.getElementById('pw-err').textContent;
  check(![...d.getElementById('pw-form').querySelectorAll('input')].some(x => x.disabled), 'tài khoản Supabase: form đổi mật khẩu dùng được');

  setv('pw-cur', ''); setv('pw-new', 'matkhaumoi1'); setv('pw-new2', 'matkhaumoi1'); await submit();
  check(/mật khẩu hiện tại/i.test(err()) && calls().length === 0, 'thiếu mật khẩu hiện tại → báo lỗi, không gọi máy chủ');
  setv('pw-cur', 'matkhaucu1'); setv('pw-new', 'ngan'); setv('pw-new2', 'ngan'); await submit();
  check(/ít nhất 8 ký tự/.test(err()) && calls().length === 0, 'mật khẩu mới < 8 ký tự → báo lỗi, không gọi máy chủ');
  setv('pw-new', 'matkhaucu1'); setv('pw-new2', 'matkhaucu1'); await submit();
  check(/khác mật khẩu hiện tại/.test(err()) && calls().length === 0, 'mật khẩu mới trùng mật khẩu cũ → báo lỗi');
  setv('pw-new', 'matkhaumoi1'); setv('pw-new2', 'khacnhau123'); await submit();
  check(/chưa khớp/.test(err()) && calls().length === 0, 'nhập lại không khớp → báo lỗi, không gọi máy chủ');
  setv('pw-cur', 'saimatkhau'); setv('pw-new2', 'matkhaumoi1'); await submit();
  check(/hiện tại chưa đúng/.test(err()) && calls().length === 1 && calls()[0][0] === 'signIn' && calls()[0][1].email === EMAIL, 'mật khẩu hiện tại sai → báo "chưa đúng", KHÔNG đổi mật khẩu');
  calls().length = 0;
  setv('pw-cur', 'matkhaucu1'); await submit();
  check(calls().length === 2 && calls()[0][0] === 'signIn' && calls()[0][1].password === 'matkhaucu1' && calls()[1][0] === 'update' && calls()[1][1].password === 'matkhaumoi1', 'đúng mật khẩu cũ → xác nhận rồi mới đổi sang mật khẩu mới');
  check(d.getElementById('pw-cur').value === '' && d.getElementById('pw-new').value === '' && d.getElementById('pw-new2').value === '' && err() === '', 'đổi xong: xóa sạch các ô mật khẩu');
  check(/Đã đổi mật khẩu/.test([...d.querySelectorAll('#nt-stack .nt')].map(e => e.textContent).join(' ')), 'có thông báo "Đã đổi mật khẩu"');
  check(!/matkhaumoi1|matkhaucu1/.test(JSON.stringify(Object.assign({}, w.localStorage)) + JSON.stringify(Object.assign({}, w.sessionStorage))), 'không lưu mật khẩu vào trình duyệt');
  check(errors.length === 0, 'không lỗi JavaScript (Supabase)' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // Lỗi từ máy chủ được dịch sang tiếng Việt
  ({ w, d, errors, authCalls: _ } = Object.assign(boot({ mode: 'sb', hour: 10, pwErr: 'New password should be different from the old password.' }), {}));
  await wait(900);
  d.querySelector('#side [data-side-tab="settings"]').click();
  const setv2 = (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
  setv2('pw-cur', 'matkhaucu1'); setv2('pw-new', 'matkhaumoi1'); setv2('pw-new2', 'matkhaumoi1');
  d.getElementById('pw-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(250);
  const e2 = d.getElementById('pw-err').hidden ? '' : d.getElementById('pw-err').textContent;
  check(/khác mật khẩu cũ/.test(e2) && !/should be different/i.test(e2), 'lỗi tiếng Anh của Supabase được dịch sang tiếng Việt (' + e2 + ')');
  w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
