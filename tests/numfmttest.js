// Ô nhập Tiền chạy / Doanh số ở bảng cấp Quảng cáo: hiển thị có dấu chấm ngăn nghìn (7.000.000) khi không gõ;
// bấm vào ô thì về số gốc (7000000) để sửa; dữ liệu lưu luôn là giá trị gốc, không lưu chuỗi đã định dạng.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); })();
const row = (name, spend, rev) => ({ accountId: 'act_1', campaign: 'C', campaign_id: 'C1', adset: 'A', adset_id: 'A1', name, ad_id: name, spend, mess: 5, phone: 1, rev });
const KEY = 'ads-eval-v1-s@e.com';
const seed = { t1: 25, t2: 35, day: today, byAcc: { act_1: { name: 'TK', days: { [today]: [row('Bài A', '7000000', '50000000'), row('Bài B', '100k', '1tr'), row('Bài C', '500', '')] } } } };

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt', local: true }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK' }));
      w.localStorage.setItem(KEY, JSON.stringify(seed));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(700);
  [...d.querySelectorAll('#hier-tabs .htab')][2].click(); await wait(200);
  d.querySelector('[data-view="table"]').click(); await wait(300);
  const inp = (name, f) => { const tr = [...d.querySelectorAll('.tbl tr.vid')].find(r => r.querySelector('input.nm').value === name); return tr && tr.querySelector('input[data-f="' + f + '"]'); };
  const stored = name => { const s = JSON.parse(w.localStorage.getItem(KEY)); const rows = s.byAcc.act_1.days[today] || []; return rows.find(r => r.name === name) || {}; };

  check(inp('Bài A', 'spend') && inp('Bài A', 'spend').value === '7.000.000', 'Tiền chạy 7000000 hiện "7.000.000" (thực tế "' + (inp('Bài A', 'spend') || {}).value + '")');
  check(inp('Bài A', 'rev').value === '50.000.000', 'Doanh số 50000000 hiện "50.000.000" (thực tế "' + inp('Bài A', 'rev').value + '")');
  check(inp('Bài B', 'spend').value === '100k' && inp('Bài B', 'rev').value === '1tr', 'giá trị nhập kiểu "100k", "1tr" giữ nguyên');
  check(inp('Bài C', 'spend').value === '500', 'số dưới 1.000 giữ nguyên ("500")');

  const a = inp('Bài A', 'spend');
  a.focus(); a.dispatchEvent(new w.FocusEvent('focusin', { bubbles: true }));
  check(a.value === '7000000', 'bấm vào ô → hiện số gốc để sửa (thực tế "' + a.value + '")');
  a.value = '8000000'; a.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50);
  a.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true })); a.blur(); await wait(50);
  check(a.value === '8.000.000', 'rời ô → hiện lại có dấu chấm ("' + a.value + '")');
  await wait(400);
  check(stored('Bài A').spend === '8000000', 'dữ liệu lưu là số gốc "8000000", không phải chuỗi định dạng (thực tế "' + stored('Bài A').spend + '")');
  check(stored('Bài A').rev === '50000000', 'Doanh số không sửa thì dữ liệu giữ nguyên "50000000" (thực tế "' + stored('Bài A').rev + '")');
  const totTxt = d.querySelector('.tbl tfoot') ? d.querySelector('.tbl tfoot').textContent : '';
  check(/^Tổng \(3\)\s*8,1tr đ/.test(totTxt.replace(/\s+/g, ' ').trim()), 'dòng Tổng tính đúng sau khi sửa (8tr + 100k + 500 = 8,1tr) — thực tế: ' + totTxt.replace(/\s+/g, ' ').trim().slice(0, 60));
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
