// jsdom: dư nợ hiển thị trong mục Tài khoản (không còn popup nổi góc dưới phải, vì bị huy hiệu Netlify che).
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function open({ session = { email: 's@e.com', name: 'S', fbToken: 'EAAtok' }, cfg = { accountId: 'act_685960921048031', accountName: 'HAI' }, extra = {}, status = 1, width = 1600 } = {}) {
  const gets = [], errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const fb = url => {
    const u = new URL(url), p = u.pathname;
    if (/me\/adaccounts/.test(p)) return { data: [{ account_id: '685960921048031', name: 'HAI 7 - 2026', account_status: 1, currency: 'VND' }, { account_id: '2', name: 'TK USD', account_status: 1, currency: 'USD' }] };
    if (/act_685960921048031$/.test(p)) return { id: 'act_685960921048031', name: 'HAI 7 - 2026', account_id: '685960921048031', currency: 'VND', balance: '1970664', account_status: status };
    if (/act_2$/.test(p)) return { id: 'act_2', name: 'TK USD', account_id: '2', currency: 'USD', balance: '5000', account_status: 1 };
    return { data: [] };
  };
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true; // giả lập phiên test local hợp lệ (supabase-client.js không chạy trong jsdom)
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify(session));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify(cfg));
      for (const k in extra) w.localStorage.setItem(k, extra[k]);
      Object.defineProperty(w, 'innerWidth', { value: width, configurable: true });
      w.matchMedia = q => ({ matches: width >= 1100, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.scrollTo = () => {};
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; };
      w.fetch = url => { url = String(url); gets.push(url); return Promise.resolve({ json: () => Promise.resolve(fb(url)) }); };
    },
  });
  await wait(500);
  return { w: dom.window, d: dom.window.document, gets, errors };
}
const T = (d, s) => { const e = d.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

  let { w, d, gets, errors } = await open();
  check(!d.getElementById('v-billing') && !d.querySelector('[data-side-tab="billing"],[data-mini-tab="billing"],#tab-billing'), 'đã gỡ tab Thanh toán (menu trái, thanh nổi, banner, trang)');
  const pop = d.getElementById('debt-pop'), dlg = d.getElementById('acct-dialog');
  check(pop && dlg.contains(pop) && !pop.hidden, 'dư nợ nằm trong mục Tài khoản');
  check(!d.querySelector('aside.debt, #debt-pill, #debt-min, #debt-card'), 'đã bỏ popup nổi góc dưới phải (nút tròn, nút thu gọn)');
  check(/HAI 7 - 2026/.test(T(d, '.debt-name')) && /1\.970\.664\s*₫/.test(T(d, '.debt-amt')) && d.querySelector('.debt-amt.is-due'), 'hiện dư nợ 1.970.664 ₫ (tô đỏ vì > 0) của TK đang xem');
  const a = d.querySelector('.debt-pay');
  check(a && a.href === 'https://www.facebook.com/ads/manager/billing/transactions/?act=685960921048031' && a.target === '_blank', 'link "Thanh toán trên Facebook ↗" đúng TK');
  const fbGets = gets.filter(u => /graph\.facebook\.com\/v[\d.]+\/act_\d+\?/.test(u));
  check(fbGets.length === 1 && decodeURIComponent(fbGets[0]).includes('fields=name,account_id,currency,balance,account_status') && !/adspaymentcycle|next_bill_date|adtrust_dsl|activities/.test(fbGets.join()), 'chỉ 1 lần gọi Facebook, chỉ dùng trường có trong tài liệu');
  const badge = d.getElementById('side-debt');
  check(badge && !badge.hidden && /1\.970\.664/.test(badge.textContent), 'nút "Tài khoản" ở menu trái có huy hiệu dư nợ 1.970.664');
  d.querySelector('[data-open-account]').click();
  check(dlg.open && /Dư nợ quảng cáo/.test(dlg.textContent), 'bấm "Tài khoản" → mở cửa sổ có phần Dư nợ quảng cáo');
  d.getElementById('debt-refresh').click(); await wait(200);
  check(gets.filter(u => /graph\.facebook\.com\/v[\d.]+\/act_\d+\?/.test(u)).length >= 2, 'nút ↻ tải lại dư nợ');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''));
  w.close();

  ({ w, d } = await open({ status: 3 }));
  check(/Chưa thanh toán/.test(T(d, '.debt-tag')) && d.getElementById('debt-pop').classList.contains('has-unpaid'), 'TK trạng thái 3 → nhãn "Chưa thanh toán", viền cảnh báo');
  w.close();

  ({ w, d } = await open({ cfg: { accountId: '__ALL__', accountName: 'Tất cả tài khoản' } }));
  await wait(300);
  const rows = [...d.querySelectorAll('.debt-row')].map(r => r.textContent.replace(/\s+/g, ' '));
  check(rows.length === 2 && /1\.970\.664\s*₫/.test(rows[0]) && /50,00\s*US\$|US\$\s*50|50,00\s*\$/.test(rows[1]), 'chế độ Tất cả TK: mỗi TK một dòng; USD 5000 cent → 50 US$');
  check(T(d, '#side-debt') === '2 TK', 'nhiều tiền tệ khác nhau → huy hiệu ghi "2 TK" (không cộng lẫn)');
  w.close();

  ({ w, d } = await open({ session: { email: 's@e.com', name: 'S' } }));
  check(d.getElementById('debt-pop').hidden && d.getElementById('side-debt').hidden, 'TK chưa có Facebook token → ẩn phần dư nợ và huy hiệu');
  w.close();

  ({ w, d } = await open({ width: 600 }));
  check(!d.querySelector('aside.debt') && !d.getElementById('side-debt').hidden, 'điện thoại: không có popup nổi, huy hiệu dư nợ ở nút Tài khoản');
  w.close();

  // Lần trước đang ở tab Thanh toán (đã bỏ) → về Báo cáo ngày, không lỗi
  const key = 'ads-eval-v1-s@e.com';
  ({ w, d, errors } = await open({ extra: { [key]: JSON.stringify({ tab: 'billing' }) } }));
  check(!d.getElementById('v-day').hidden && errors.length === 0, 'lần trước ở tab Thanh toán → tự về Báo cáo ngày, không lỗi');
  w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})();
