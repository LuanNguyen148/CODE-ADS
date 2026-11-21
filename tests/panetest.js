// Tiêu đề hồ sơ + nút tab dạng viên thuốc (kiểu Vision UI) cho tab Cài đặt và cửa sổ Tài khoản.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

function boot({ token }) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 'shop@example.com', name: 'Shop Noel', fbToken: token ? 'EAAt' : undefined, local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK 1' }));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; };
      w.fetch = url => { url = String(url); let body = { data: [] };
        if (/me\/adaccounts/.test(url)) body = { data: [{ account_id: '1', name: 'TK 1', account_status: 1, currency: 'VND' }] };
        if (/act_1\?/.test(url)) body = { id: 'act_1', name: 'TK 1', account_id: '1', currency: 'VND', balance: '1970664', account_status: 1 };
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') }); };
    },
  });
  return { w: dom.window, d: dom.window.document, errors };
}

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

  // ===== A) Cài đặt =====
  let { w, d, errors } = boot({ token: true });
  await wait(700);
  const off = el => el.classList.contains('pane-off');
  d.querySelector('#side [data-side-tab="settings"]').click();
  check(d.getElementById('set-av').textContent === 'S' && /Shop Noel/.test(d.getElementById('set-name').textContent) && /shop@example\.com/.test(d.getElementById('set-email').textContent), 'Cài đặt: tiêu đề hồ sơ có avatar chữ cái, tên và email');
  const tabs = [...d.querySelectorAll('[data-set-tab]')], pane = k => d.querySelector('[data-set-pane="' + k + '"]');
  check(tabs.length === 3 && tabs.map(b => b.dataset.setTab).join() === 'look,tg,pw' && !d.getElementById('set-tab-fx') && !d.getElementById('set-pane-fx'), 'Cài đặt: 3 nút tab Giao diện / Telegram / Mật khẩu (đã gộp Hiệu ứng vào Giao diện)');
  check(!off(pane('look')) && off(pane('tg')) && off(pane('pw')) && tabs[0].getAttribute('aria-selected') === 'true', 'mặc định chỉ hiện nhóm "Giao diện"');
  tabs[2].click();
  check(off(pane('look')) && off(pane('tg')) && !off(pane('pw')) && tabs[2].getAttribute('aria-selected') === 'true' && tabs[0].getAttribute('aria-selected') === 'false', 'bấm "Mật khẩu" → chỉ hiện nhóm Mật khẩu');
  check(pane('pw').contains(d.getElementById('pw-form')) && pane('look').contains(d.querySelector('[data-theme="night"]')) && pane('look').contains(d.getElementById('set-snow')) && pane('tg').contains(d.getElementById('tn-token')) && pane('tg').contains(d.getElementById('tn-link')), 'các điều khiển nằm đúng nhóm');
  d.getElementById('set-tabs').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  check(!off(pane('tg')) && tabs[1].getAttribute('aria-selected') === 'true', 'phím ← chuyển sang tab trước (bàn phím dùng được)');
  tabs[0].click();
  d.querySelector('[data-theme="night"]').click();
  check(d.documentElement.dataset.scene === 'night', 'đổi giao diện trong nhóm vẫn hoạt động');
  w.close();

  // ===== B) Cửa sổ Tài khoản: có token → có tab Dư nợ =====
  ({ w, d, errors } = boot({ token: true }));
  await wait(900);
  const dlg = d.getElementById('acct-dialog'), fbP = d.querySelector('[data-acct-pane="fb"]'), debtP = d.querySelector('[data-acct-pane="debt"]');
  const aTabs = [...d.querySelectorAll('[data-acct-tab]')];
  check(aTabs.map(b => b.dataset.acctTab).join() === 'fb,debt', 'Tài khoản: 2 nút tab Facebook / Dư nợ');
  check(!d.getElementById('acct-tab-debt').hidden, 'có token → tab "Dư nợ" hiện');
  d.querySelector('#side .side-account').click();
  check(dlg.open && !off(fbP) && off(debtP) && aTabs[0].getAttribute('aria-selected') === 'true', 'mở Tài khoản → mặc định ở tab Facebook');
  aTabs[1].click();
  check(off(fbP) && !off(debtP) && /1\.970\.664/.test(debtP.textContent), 'bấm "Dư nợ" → thấy số dư nợ, ẩn phần Facebook');
  d.getElementById('acct-close').click();
  d.querySelector('#side .side-account').click();
  check(!off(fbP) && off(debtP), 'đóng rồi mở lại → quay về tab Facebook');
  d.getElementById('acct-close').click();
  d.getElementById('side-debt').click();
  check(dlg.open && off(fbP) && !off(debtP), 'bấm huy hiệu dư nợ ở menu → mở thẳng tab Dư nợ');
  check(/^[A-Z]$/.test(d.getElementById('acct-avatar').textContent), 'avatar có chữ cái');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // ===== C) Không có token → không có dư nợ → ẩn tab Dư nợ =====
  ({ w, d } = boot({ token: false }));
  await wait(700);
  check(d.getElementById('acct-tab-debt').hidden, 'chưa có token → ẩn tab "Dư nợ"');
  w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
