// Tab "Tổng theo bài" và "Tổng theo ngày": bỏ dòng đếm "Tốt · Theo dõi · Cắt/sửa" và chữ đánh giá dưới "CPQC chung"
// (màu của con số đã cho biết đánh giá); bảng phía dưới cùng phong cách với bảng ở Báo cáo ngày.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); })();
const row = (name, spend, rev) => ({ accountId: 'act_1', campaign: 'C', campaign_id: 'C1', adset: 'A', adset_id: 'A1', name, ad_id: name, spend: String(spend), mess: 5, phone: 1, rev: String(rev) });
const day = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const seed = { t1: 25, t2: 35, day: today, byAcc: { act_1: { name: 'TK', days: {
  [today]: [row('Bài tốt', 100000, 1000000), row('Bài theo dõi', 300000, 1000000), row('Bài cắt', 800000, 1000000)],
  [day(-1)]: [row('Bài tốt', 100000, 1000000)],
  [day(-2)]: [row('Bài tốt', 300000, 1000000)] } } } };

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
      w.localStorage.setItem('ads-eval-v1-s@e.com', JSON.stringify(seed));
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(700);
  const tiles = id => [...d.querySelectorAll('#' + id + ' .k')];
  const tileByLabel = (id, label) => tiles(id).find(t => t.querySelector('small').textContent.trim() === label);

  d.querySelector('#tab-ads').click(); await wait(300);
  // Các tab thống kê dùng chung bộ chọn ngày với Báo cáo ngày: chọn khoảng 7 ngày gần đây bằng chính bộ chọn đó
  d.getElementById('dp-from').value = day(-6); d.getElementById('dp-to').value = today; d.getElementById('dp-apply').click(); await wait(300);
  const a1 = tileByLabel('akp', 'Số bài ads'), a4 = tileByLabel('akp', 'CPQC chung');
  check(a1 && a1.querySelector('b').textContent.trim() === '3', '"Số bài ads" vẫn hiện số bài (3)');
  check(a1 && !/Tốt|Theo dõi|Cắt/.test(a1.textContent), '"Số bài ads": đã bỏ dòng "Tốt · Theo dõi · Cắt/sửa" (thực tế: "' + (a1 ? a1.textContent.replace(/\s+/g, ' ').trim() : '') + '")');
  check(a4 && a4.querySelector('i').textContent.trim() === '', '"CPQC chung" ở tab Theo bài: đã bỏ chữ đánh giá bên dưới (thực tế: "' + (a4 ? a4.querySelector('i').textContent.trim() : '') + '")');
  check(a4 && ['g', 'y', 'r', 'n'].includes(a4.dataset.g), '"CPQC chung" vẫn tô màu theo đánh giá (data-g=' + (a4 && a4.dataset.g) + ')');
  const best = tileByLabel('akp', 'Bài tốt nhất');
  check(best && /Bài tốt/.test(best.textContent), '"Bài tốt nhất" vẫn hiện tên bài');

  d.querySelector('#tab-days').click(); await wait(300);
  const s5 = tileByLabel('skp', 'CPQC chung');
  check(s5 && s5.querySelector('i').textContent.trim() === '', '"CPQC chung" ở tab Theo ngày: đã bỏ chữ đánh giá bên dưới (thực tế: "' + (s5 ? s5.querySelector('i').textContent.trim() : '') + '")');
  check(tileByLabel('skp', 'Mess') && /Giá mess/.test(tileByLabel('skp', 'Mess').textContent), 'ô Mess vẫn hiện "Giá mess"');
  // Màu CPQC từng ngày ở bảng "Tổng theo ngày" theo ngưỡng: hôm qua tốt (10%), hôm kia theo dõi (30%), hôm nay cắt (40%)
  const gOf = dk => { const r = d.querySelector('#stab tbody tr[data-d="' + dk + '"] .spill'); return r ? r.dataset.g : null; };
  check(gOf(today) === 'r', 'bảng Tổng theo ngày: hôm nay CPQC 40% → nhãn đỏ (data-g=' + gOf(today) + ')');
  check(gOf(day(-1)) === 'g', 'bảng Tổng theo ngày: hôm qua CPQC 10% → nhãn xanh (data-g=' + gOf(day(-1)) + ')');
  check(gOf(day(-2)) === 'y', 'bảng Tổng theo ngày: hôm kia CPQC 30% → nhãn vàng (data-g=' + gOf(day(-2)) + ')');
  // Đổi ngưỡng thì màu đổi theo ngay khi xem lại bảng
  [['t1', '35'], ['t2', '200']].forEach(([id, v]) => { const el = d.getElementById(id); el.value = v; el.dispatchEvent(new w.Event('input')); });
  d.querySelector('#tab-ads').click(); await wait(100); d.querySelector('#tab-days').click(); await wait(300);
  check(gOf(day(-2)) === 'g' && gOf(today) === 'y', 'đổi ngưỡng (35/200) → màu nhãn đổi theo (hôm kia ' + gOf(day(-2)) + ', hôm nay ' + gOf(today) + ')');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  w.close();

  // Bảng ở hai tab cùng phong cách với bảng Báo cáo ngày (đọc CSS gồm cả file ngoài)
  const dir = path.dirname(path.resolve(process.argv[2]));
  const linked = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)/g)].map(m => m[1]).filter(f => fs.existsSync(dir + '/' + f)).map(f => fs.readFileSync(dir + '/' + f, 'utf8'));
  const css = html.match(/<style>([\s\S]*?)<\/style>/g).concat(linked).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = css.match(/[^{}]+{[^{}]*}/g) || [];
  const last = (selRe, prop) => { let v = null; rules.forEach(r => { if (selRe.test(r.split('{')[0].trim())) { const m = r.split('{')[1].match(new RegExp('(?:^|;)\\s*' + prop + ':\\s*([^;}]+)')); if (m) v = m[1].trim(); } }); return v; };
  check(last(/^\.stats th$/, 'text-transform') === 'uppercase' && parseFloat(last(/^\.stats th$/, 'font-size')) <= 12, 'tiêu đề cột bảng thống kê: chữ hoa nhỏ như bảng Báo cáo ngày');
  check(parseFloat((last(/^\.stats td$/, 'padding') || '0').split(' ')[0]) >= 12, 'hàng bảng thống kê thoáng (padding dọc >= 12px)');
  check(/#1c7c3a/i.test(last(/^\.spill\[data-g=g\]$/, 'background') || ''), 'nhãn CPQC "Tốt" ở bảng thống kê là nhãn đặc màu xanh như bảng Báo cáo ngày');
  // Cột số chia đều độ rộng (khoảng cách giữa các cột đều nhau), cột đầu có độ rộng riêng
  ['#stab', '#atab'].forEach(id => {
    check(last(new RegExp('^' + id + '$'), 'table-layout') === 'fixed', id + ': table-layout:fixed → các cột số rộng đều nhau');
    check(/%$/.test(last(new RegExp('^' + id + ' th:first-child$'), 'width') || ''), id + ': cột đầu (Ngày / Tên bài) có độ rộng riêng theo %');
  });
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
