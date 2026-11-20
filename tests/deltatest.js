// 4 ô số liệu đầu trang hiện % tăng/giảm so với hôm qua (kiểu Vision UI: "+55%" xanh, "−2%" đỏ).
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const key = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const row = (spend, mess, phone, rev) => ({ accountId: 'act_1', campaign: 'C', campaign_id: 'C1', adset: 'A', adset_id: 'A1', name: 'QC', ad_id: 'AD1', spend: String(spend), mess, phone, rev: String(rev) });

function boot(days) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt' }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK 1' }));
      w.localStorage.setItem('ads-eval-v1-s@e.com', JSON.stringify({ t1: 25, t2: 35, byAcc: { act_1: { name: 'TK 1', days } } }));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  return { w: dom.window, d: dom.window.document, errors };
}

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

  // Hôm nay: tiền 1.000.000 (hôm qua 800.000 → +25%), DS 3tr (hôm qua 4tr → −25%), mess 30 = 30 (0%), SĐT 5 (hôm qua 0 → không có %)
  let { w, d, errors } = boot({ [key(0)]: [row(1000000, 30, 5, 3000000)], [key(-1)]: [row(800000, 30, 0, 4000000)] });
  await wait(700);
  const tiles = [...d.querySelectorAll('#kp .k')];
  const dl = i => tiles[i] && tiles[i].querySelector('.kd');
  const txt = i => dl(i) ? dl(i).textContent.trim() : '';
  check(tiles.length === 4 && tiles.every(t => t.querySelector('.kd')), '4 ô số liệu đều có chỗ hiện % so với hôm qua');
  check(txt(0) === '+25%', 'tiền chạy 1tr so với 800k → "+25%" (thực tế: "' + txt(0) + '")');
  check(txt(1) === '−25%' && dl(1).classList.contains('down'), 'doanh số 3tr so với 4tr → "−25%" màu đỏ (thực tế: "' + txt(1) + '")');
  check(txt(2) === '0%', 'mess bằng hôm qua → "0%" (thực tế: "' + txt(2) + '")');
  check(dl(3) && dl(3).hidden, 'SĐT hôm qua = 0 → không hiện % (tránh chia cho 0)');
  check(dl(1).classList.contains('down') && !dl(1).classList.contains('up') && dl(0).classList.contains('flat'), 'doanh số giảm → đỏ; tiền chạy tăng → trung tính (tiền chạy nhiều chưa chắc là tốt)');
  check(/hôm qua/i.test(dl(0).title) && /19|20|21|22|23|24|25|26|27|28|29|30|31|0?[1-9]\//.test(dl(0).title), 'rê chuột vào % thấy "so với hôm qua (ngày/tháng)"');
  // Số tiền chênh lệch so với hôm qua (tiền chạy và doanh số)
  const dv = i => tiles[i] && tiles[i].querySelector('.kdv') ? tiles[i].querySelector('.kdv').textContent.trim() : '';
  check(dv(0) === 'Tăng 200k đ so với hôm qua', 'tiền chạy: "Tăng 200k đ so với hôm qua" (thực tế: "' + dv(0) + '")');
  check(dv(1) === 'Giảm 1tr đ so với hôm qua' && tiles[1].querySelector('.kdv').classList.contains('down'), 'doanh số: "Giảm 1tr đ so với hôm qua" màu đỏ (thực tế: "' + dv(1) + '")');
  check(tiles[0].querySelector('.kdv').classList.contains('flat'), 'tiền chạy tăng/giảm số tiền: màu trung tính');
  check(dv(2) === '' || !tiles[2].querySelector('.kdv'), 'ô Mess / SĐT không hiện số tiền chênh lệch (không phải tiền)');
  check(/Giá mess/.test(tiles[2].textContent), 'ô Mess vẫn hiện "Giá mess"');

  // Doanh số tăng → xanh
  w.close();
  ({ w, d } = boot({ [key(0)]: [row(500000, 10, 2, 5000000)], [key(-1)]: [row(500000, 8, 1, 4000000)] }));
  await wait(700);
  const t2 = [...d.querySelectorAll('#kp .k')];
  check(t2[1].querySelector('.kd').textContent.trim() === '+25%' && t2[1].querySelector('.kd').classList.contains('up'), 'doanh số tăng → "+25%" màu xanh');
  check(t2[3].querySelector('.kd').textContent.trim() === '+100%' && t2[3].querySelector('.kd').classList.contains('up'), 'SĐT 2 so với 1 → "+100%" xanh');
  w.close();

  // Không có dữ liệu hôm qua → không hiện % nào, không lỗi
  ({ w, d, errors } = boot({ [key(0)]: [row(500000, 10, 2, 5000000)] }));
  await wait(700);
  check([...d.querySelectorAll('#kp .kd')].every(e => e.hidden), 'không có dữ liệu hôm qua → ẩn hết, không lỗi');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
