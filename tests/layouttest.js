// jsdom: gauge without "Cắt / sửa"; FB panel removed; account select + sync above tabs; token only in Account.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const errors = [], gets = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt' }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK 1' }));
      w.matchMedia = q => ({ matches: /min-width:1100px/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; };
      w.fetch = url => { url = String(url); gets.push(url);
        const body = /me\/adaccounts/.test(url) ? { data: [{ account_id: '1', name: 'TK 1', account_status: 1, currency: 'VND' }, { account_id: '2', name: 'TK 2', account_status: 1, currency: 'VND' }] } : { data: [] };
        return Promise.resolve({ json: () => Promise.resolve(body) }); };
    },
  });
  const w = dom.window, d = w.document;
  await wait(500);
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const parentId = id => { const p = d.getElementById(id).parentNode; return p && p.id; };
  check(!d.getElementById('fb-panel') && !d.querySelector('[data-side-jump="fb-panel"]'), 'đã gỡ khung Đồng bộ Facebook (cột phải) và mục "Kết nối Facebook" ở menu');
  check(parentId('acc-ctl') === 'hier-acc-slot' && parentId('sync-ctl') === 'hier-sync-slot', 'Báo cáo ngày: ô chọn TKQC + nút đồng bộ nằm ở hàng trên cùng của khung tab');
  const top = d.querySelector('.hier-nav > .hier-top'), tabs = d.querySelector('.hier-nav > .hier-tabs-row');
  check(top && tabs && (top.compareDocumentPosition(tabs) & w.Node.DOCUMENT_POSITION_FOLLOWING), 'hàng chọn TKQC nằm ngay trên các tab Chiến dịch / Nhóm QC / Quảng cáo');
  check(d.getElementById('fb-acc-select').options.length >= 2, 'ô chọn TKQC vẫn nạp danh sách tài khoản (' + d.getElementById('fb-acc-select').options.length + ' mục)');
  check(!d.getElementById('fb-token-input').closest('.hier-nav') && d.getElementById('acct-dialog').contains(d.getElementById('fb-token-input')), 'token chỉ nằm trong mục Tài khoản');
  // Đổi tài khoản ở ô chọn → tự tải dữ liệu TK mới
  const sel = d.getElementById('fb-acc-select'); const before = gets.length;
  sel.value = sel.querySelector('option[value*="2"]') ? sel.querySelector('option[value*="2"]').value : sel.value;
  sel.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(200);
  check(gets.slice(before).some(u => /act_2/.test(u)), 'đổi TKQC ở hàng trên cùng → tải dữ liệu TK mới');
  // Bấm nhãn trạng thái → mở Tài khoản, con trỏ ở ô token
  d.getElementById('fb-badge').click();
  check(d.getElementById('acct-dialog').open && d.activeElement === d.getElementById('fb-token-input'), 'bấm nhãn trạng thái kết nối → mở mục Tài khoản, con trỏ ở ô token');
  d.getElementById('acct-close').click();
  // Đổi tab: cụm điều khiển đi theo
  d.querySelector('#side [data-side-tab="toggle"]').click(); await wait(50);
  check(parentId('acc-ctl') === 'tg-acc-slot' && parentId('sync-ctl') === 'tg-sync-slot', 'tab Bật/Tắt: ô chọn TKQC + đồng bộ chuyển lên đầu tab');
  d.querySelector('#side [data-side-tab="days"]').click(); await wait(50);
  check(parentId('acc-ctl') === 'rng-acc-slot' && parentId('sync-ctl') === 'rng-sync-slot', 'tab Thống kê: chuyển lên đầu khung chọn khoảng ngày');
  check(d.documentElement.getAttribute('data-tab') === 'days', 'tab Thống kê: CSS hiện nút "Đồng bộ khoảng ngày" thay cho "Lấy số liệu ngày này"');
  d.querySelector('#side [data-side-tab="day"]').click(); await wait(50);
  check(parentId('acc-ctl') === 'hier-acc-slot', 'quay lại Báo cáo ngày: về hàng trên các tab');
  // Vòng tròn CPQC: không còn "Cắt / sửa"
  const gauge = () => d.getElementById('gvd');
  const setIn = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  setIn(d.getElementById('t1'), '10'); setIn(d.getElementById('t2'), '20');
  d.querySelector('[data-htab="ad"]').click(); await wait(50);
  d.getElementById('add').click(); await wait(50);
  const art = [...d.querySelectorAll('#list .vid')].pop();
  if (art) { setIn(art.querySelector('[data-f="spend"]'), '500k'); setIn(art.querySelector('[data-f="rev"]'), '1tr'); }
  await wait(100);
  check(art && parseFloat(d.getElementById('gcp').textContent.replace(',', '.')) > 20 && gauge().hidden && !/Cắt/.test(gauge().textContent), 'CPQC ' + d.getElementById('gcp').textContent + ' (> ngưỡng 20%) → vòng tròn KHÔNG hiện "Cắt / sửa"');
  setIn(d.getElementById('t1'), '60'); setIn(d.getElementById('t2'), '80'); await wait(100);
  check(!gauge().hidden && gauge().textContent === 'Tốt', 'cùng CPQC nhưng ngưỡng tốt 60% → vẫn hiện "' + gauge().textContent + '"');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  w.close();
})();
