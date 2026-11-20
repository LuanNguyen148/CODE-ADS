// jsdom: Facebook token field lives in the new "Tài khoản" dialog.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const errors = [], gets = [];
  let fbMode = 'notoken';
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'test', name: 'Tài khoản test local', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      w.matchMedia = q => ({ matches: /min-width:1100px/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; };
      w.fetch = url => { url = String(url); gets.push(url);
        const body = /me\/adaccounts/.test(url) ? (fbMode === 'bad' ? { error: { message: 'Invalid OAuth access token.' } } : { data: [{ account_id: '1', name: 'TK Noel', account_status: 1, currency: 'VND' }] }) : { data: [] };
        return Promise.resolve({ json: () => Promise.resolve(body) }); };
    },
  });
  const w = dom.window, d = w.document;
  await wait(400);
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const dlg = d.getElementById('acct-dialog'), input = d.getElementById('fb-token-input');
  check(!d.querySelector('.hier-nav').contains(input) && dlg.contains(input), 'ô token đã chuyển từ khung Facebook vào cửa sổ Tài khoản');
  check(/mục “Tài khoản”/.test(d.getElementById('fb-msg').textContent), 'chưa có token → dòng trạng thái chỉ tới mục Tài khoản');
  // Mở từ menu trái
  d.querySelector('#side .side-account').click();
  check(dlg.open && d.getElementById('acct-name').textContent === 'Tài khoản test local' && d.getElementById('acct-email').textContent.startsWith('test'), 'menu trái → "Tài khoản": mở cửa sổ, hiện tên + email');
  check(/Chưa có Access Token/.test(d.getElementById('acct-fb-state').textContent) && /chỉ dùng trong lần mở trang này/.test(d.getElementById('acct-token-note').textContent), 'trạng thái "Chưa có Access Token" + ghi chú phiên test local');
  check(d.getElementById('fb-token-get-btn').href === 'https://developers.facebook.com/tools/explorer/' && /Gia hạn 60 ngày/.test(d.getElementById('fb-token-hint').textContent), 'giữ link "Lấy token ↗" và "Gia hạn 60 ngày ↗"');
  d.getElementById('acct-close').click();
  check(!dlg.open, 'nút ✕ đóng cửa sổ');
  // Mở từ khung Facebook → con trỏ vào ô token
  d.getElementById('fb-badge').click();
  check(dlg.open && d.activeElement === input, 'nút "Tài khoản & Token" → mở và đặt con trỏ vào ô token');
  // Dán token sai → thông báo lỗi có nút "Cập nhật token"
  fbMode = 'bad';
  input.value = 'EAAbadtoken123'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(800);
  check(gets.some(u => /me\/adaccounts/.test(u) && /access_token=EAAbadtoken123/.test(u)), 'dán token → tự áp dụng sau ~0,6s, gọi Facebook bằng token mới (giữ cách hoạt động cũ)');
  const t = d.querySelector('#nt-stack .nt-error');
  check(t && /Invalid OAuth/.test(t.textContent) && t.querySelector('.nt-act') && t.querySelector('.nt-act').textContent === 'Cập nhật token', 'token sai → thông báo lỗi kèm nút "Cập nhật token"');
  check(dlg.open, 'token sai → cửa sổ Tài khoản vẫn mở để dán lại');
  d.getElementById('acct-close').click();
  t.querySelector('.nt-act').click();
  check(dlg.open && d.activeElement === input, 'bấm "Cập nhật token" → mở lại cửa sổ, con trỏ ở ô token');
  // Dán token đúng → lấy tài khoản thành công thì cửa sổ tự đóng
  fbMode = 'ok';
  input.value = 'EAAgoodtoken' + 'x'.repeat(40); input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(900);
  check(!dlg.open, 'token đúng, lấy tài khoản thành công → cửa sổ Tài khoản tự đóng');
  check(/kết nối Facebook thành công/i.test([...d.querySelectorAll('#nt-stack .nt')].map(e => e.textContent).join(' ')), 'có thông báo "kết nối Facebook thành công"');
  check(!/Chưa có Access Token/.test(d.getElementById('acct-fb-state').textContent), 'dòng trạng thái không còn ghi "Chưa có Access Token"');
  d.querySelector('#side .side-account').click();
  check(dlg.open && /Trạng thái/.test(d.getElementById('acct-fb-state').textContent), 'mở lại Tài khoản → trạng thái cập nhật (đã có token)');
  d.getElementById('acct-close').click();
  // Cửa sổ Tài khoản không còn nút Đăng xuất (đăng xuất ở menu trái)
  check(!d.getElementById('acct-logout') && !/Đăng xuất/.test(dlg.textContent), 'cửa sổ Tài khoản đã bỏ nút "Đăng xuất"');
  d.getElementById('acct-close').click();
  // Thẻ người dùng ở menu trái cũng mở được (bằng bàn phím)
  d.querySelector('#side .side-user').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check(dlg.open, 'thẻ người dùng ở menu trái: nhấn Enter cũng mở Tài khoản');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  w.close();
})();
