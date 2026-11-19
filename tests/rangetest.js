// jsdom: date picker with start/end date; range = read-only aggregate; per-day storage untouched.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const T = new Date(), day = k => key(new Date(T.getFullYear(), T.getMonth(), T.getDate() + k));
const D0 = day(0), D1 = day(-1), D2 = day(-2);
const row = (extra) => Object.assign({ campaign: 'Camp Noel', campaign_id: 'C1', adset: 'Set 1', adset_id: 'A1', name: 'QC Noel', ad_id: 'AD1', accountId: 'act_1', spend: 100000, mess: 2, phone: 1, rev: '1000000' }, extra || {});
const EMAIL = 's@e.com', KEY = 'ads-eval-v1-' + EMAIL;
const seed = { t1: 25, t2: 35, byAcc: { act_1: { name: 'TK 1', days: { [D0]: [row()], [D1]: [row()], [D2]: [row(), row({ ad_id: 'AD2', name: 'QC 2', spend: 50000, rev: '0', phone: 0, mess: 1 })] } } } };
(async () => {
  const errors = [], gets = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: EMAIL, name: 'S', fbToken: 'EAAt' }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK 1' }));
      w.localStorage.setItem(KEY, JSON.stringify(seed));
      w.matchMedia = q => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = url => { url = String(url); gets.push(url);
        // insights báo lỗi → không ghi đè dữ liệu mẫu (để kiểm tra phép gộp)
        const body = /me\/adaccounts/.test(url) ? { data: [{ account_id: '1', name: 'TK 1', account_status: 1, currency: 'VND' }] }
          : /insights/.test(url) ? { error: { message: 'mock: không lấy số liệu' } } : { data: [] };
        return Promise.resolve({ json: () => Promise.resolve(body) }); };
    },
  });
  const w = dom.window, d = w.document;
  await wait(500);
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const label = () => d.getElementById('dp-label').textContent;
  const stored = () => JSON.parse(w.localStorage.getItem(KEY)).byAcc.act_1.days;
  const adSpend = () => { const i = [...d.querySelectorAll('#list .vid [data-f="spend"]')].map(x => x.value); return i; };
  d.querySelector('[data-htab="ad"]').click(); await wait(50);
  check(adSpend().join() === '100000', '1 ngày (hôm nay): QC Noel tiền chạy 100000');

  // 7 ngày gần đây
  d.getElementById('dp-btn').click();
  d.querySelector('[data-dpr="7"]').click(); await wait(200);
  check(/^7 ngày gần đây: /.test(label()), 'nhãn: "' + label() + '"');
  d.querySelector('[data-htab="ad"]').click(); await wait(50);
  const sp = adSpend();
  check(sp.length === 2 && sp.indexOf('300000') >= 0 && sp.indexOf('50000') >= 0, 'gộp theo quảng cáo: QC Noel 3 ngày = 300000, QC 2 = 50000 (' + sp.join(', ') + ')');
  check(!d.getElementById('range-note').hidden && /tổng 7 ngày/.test(d.getElementById('range-note').textContent), 'hiện ghi chú "Đang xem tổng 7 ngày… chỉ để xem"');
  check([...d.querySelectorAll('#list input')].every(i => i.readOnly) && d.getElementById('add').disabled && d.getElementById('reset').disabled, 'khoảng ngày: ô nhập bị khóa, nút Thêm / Xóa toàn bộ bị khóa');
  check(d.getElementById('gc-cap').textContent === 'CPQC tổng khoảng ngày' && /11[.,]7%/.test(d.getElementById('gcp').textContent), 'vòng tròn: "CPQC tổng khoảng ngày" = ' + d.getElementById('gcp').textContent + ' (350k / 3tr)');
  // cố sửa khi đang xem khoảng → không đổi dữ liệu thật
  const inp = d.querySelector('#list .vid [data-f="spend"]'); inp.value = '999999'; inp.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50);
  const st = stored();
  check(st[D0][0].spend === 100000 && st[D1][0].spend === 100000 && st[D2][0].spend === 100000 && st[D2].length === 2, 'dữ liệu từng ngày KHÔNG bị ghi đè bởi số gộp (vẫn 100000 mỗi ngày)');
  // tự lấy số liệu cả khoảng cho các ngày còn thiếu
  const ins = gets.filter(u => /insights/.test(u)).map(u => decodeURIComponent(u)).find(u => u.includes('"since":"' + day(-6) + '"') && u.includes('"until":"' + D0 + '"'));
  check(!!ins, 'còn ngày thiếu số liệu → tự gọi Facebook lấy cả khoảng ' + day(-6) + ' → ' + D0);
  check(d.getElementById('fb-sync-label').textContent === 'Lấy số liệu khoảng ngày', 'nút đồng bộ đổi thành "Lấy số liệu khoảng ngày"');

  // Tùy chọn Từ ngày – Đến ngày
  d.getElementById('dp-btn').click();
  d.getElementById('dp-from').value = D2; d.getElementById('dp-to').value = D1;
  d.getElementById('dp-apply').click(); await wait(200);
  d.querySelector('[data-htab="ad"]').click(); await wait(50);
  check(adSpend().indexOf('200000') >= 0 && !/gần đây/.test(label()), 'chọn Từ ' + D2 + ' Đến ' + D1 + ' → QC Noel = 200000, nhãn "' + label() + '"');
  // Chọn đảo ngược ngày → tự đổi chỗ; quá 31 ngày → báo lỗi
  d.getElementById('dp-btn').click();
  d.getElementById('dp-from').value = day(-40); d.getElementById('dp-to').value = D0;
  d.getElementById('dp-apply').click(); await wait(50);
  check(!d.getElementById('dp-err').hidden && /tối đa 31 ngày/.test(d.getElementById('dp-err').textContent), 'chọn quá 31 ngày → báo lỗi, không áp dụng');
  // Về 1 ngày
  d.querySelector('[data-dp="0"]').click(); await wait(200);
  d.querySelector('[data-htab="ad"]').click(); await wait(50);
  check(/^Hôm nay: /.test(label()) && d.getElementById('range-note').hidden && !d.getElementById('add').disabled && [...d.querySelectorAll('#list input')].some(i => !i.readOnly), 'chọn "Hôm nay" → về xem 1 ngày, nhập liệu mở lại');
  check(adSpend().join() === '100000', '1 ngày: QC Noel lại là 100000');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  w.close();
})();
