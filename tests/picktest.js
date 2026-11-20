// Báo cáo ngày: tick chọn nhiều Chiến dịch / Nhóm QC để xem cùng lúc (chỉ lọc hiển thị, không đổi dữ liệu).
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); })();
const row = (c, cid, a, aid, ad, adid, spend, mess, phone, rev) => ({ accountId: 'act_1', campaign: c, campaign_id: cid, adset: a, adset_id: aid, name: ad, ad_id: adid, spend: String(spend), mess, phone, rev: String(rev) });
const seed = { t1: 25, t2: 35, day: today, byAcc: { act_1: { name: 'TK 1', days: { [today]: [
  row('Chiến dịch 1', 'C1', 'Nhóm 1', 'A1', 'QC 1', 'AD1', 100000, 10, 2, 1000000),
  row('Chiến dịch 1', 'C1', 'Nhóm 1', 'A1', 'QC 2', 'AD2', 200000, 20, 3, 2000000),
  row('Chiến dịch 2', 'C2', 'Nhóm 2', 'A2', 'QC 3', 'AD3', 300000, 30, 4, 3000000),
  row('Chiến dịch 3', 'C3', 'Nhóm 3', 'A3', 'QC 4', 'AD4', 400000, 40, 5, 4000000),
] } } } };

(async () => {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.ADS_LOCAL_SESSION = true;
      w.localStorage.setItem('ads_auth_session_v1', JSON.stringify({ email: 's@e.com', name: 'S', fbToken: 'EAAt' }));
      w.localStorage.setItem('ads_fb_config_v4', JSON.stringify({ accountId: 'act_1', accountName: 'TK 1' }));
      w.localStorage.setItem('ads-eval-v1-s@e.com', JSON.stringify(seed));
      w.matchMedia = q => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ data: [] }) });
    },
  });
  const w = dom.window, d = w.document;
  await wait(500);
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const q = s => [...d.querySelectorAll(s)];
  const tick = (scope, key) => { const i = d.querySelector('input[data-pick="' + scope + '"][data-key="' + key + '"]'); if (i) { i.click(); } return !!i; };
  const bar = () => d.getElementById('pick-bar');
  const tab = t => { d.querySelector('[data-htab="' + t + '"]').click(); };
  const names = () => q('#list .drill-card .nm-text, #list .drill-card [data-name], #list .drill-card strong').map(e => e.textContent.trim());

  check(q('#list .drill-card').length === 3 && q('#list input[data-pick="camp"]').length === 3, 'tab Chiến dịch: 3 thẻ, mỗi thẻ có ô tick để chọn xem cùng lúc');
  check(!bar() || bar().hidden, 'chưa chọn gì: không hiện thanh tổng hợp');

  check(tick('camp', 'C1') || tick('camp', q('#list [data-drill-camp]')[0].dataset.drillCamp), 'tick được chiến dịch đầu');
  const keys = q('#list [data-drill-camp]').map(e => e.dataset.drillCamp);
  // Chọn thêm 1 chiến dịch nữa (khác chiến dịch đã tick)
  const ticked = () => q('#list input[data-pick="camp"]').filter(i => i.checked).map(i => i.dataset.key);
  const first = ticked()[0];
  const other = keys.find(k => k !== first && /C2|2/.test(k)) || keys.find(k => k !== first);
  tick('camp', other);
  check(ticked().length === 2, 'tick 2 chiến dịch');
  check(q('#list .drill-card').length === 3, 'tab Chiến dịch vẫn liệt kê đủ 3 để chọn thêm / bỏ chọn');
  check(d.querySelector('[data-htab="campaign"]').classList.contains('active'), 'tick không làm nhảy sang tab Nhóm QC');
  check(bar() && !bar().hidden && /2 chiến dịch/.test(bar().textContent), 'thanh tổng hợp: "Đang xem 2 chiến dịch"');
  const txt = bar() ? bar().textContent.replace(/\s+/g, ' ') : '';

  tab('adset');
  check(q('#list .drill-card').length === 2, 'tab Nhóm QC: chỉ hiện nhóm thuộc 2 chiến dịch đã chọn (' + q('#list .drill-card').length + ')');
  check(/2 chiến dịch/.test(d.getElementById('hier-heading').textContent), 'tiêu đề nói rõ "2 chiến dịch đã chọn"');
  check(q('#list input[data-pick="adset"]').length === 2, 'tab Nhóm QC: mỗi nhóm có ô tick');

  tab('ad');
  const nAdsTwoCamps = q('#list .vid').length;
  tab('adset');
  tick('adset', q('#list [data-drill-adset]')[0].dataset.drillAdset);
  check(bar() && /1 nhóm QC/.test(bar().textContent), 'tick 1 nhóm QC → thanh tổng hợp đổi sang "1 nhóm QC"');
  tab('ad');
  check(q('#list .vid').length > 0 && q('#list .vid').length < nAdsTwoCamps, 'tab Quảng cáo: chỉ còn quảng cáo của nhóm đã chọn (' + q('#list .vid').length + ' < ' + nAdsTwoCamps + ')');

  const clear = d.getElementById('pick-clear');
  check(!!clear, 'có nút "Bỏ chọn"');
  if (clear) clear.click();
  check(q('#list .vid').length === 4 && (!bar() || bar().hidden), 'Bỏ chọn → trả lại đủ 4 quảng cáo, ẩn thanh tổng hợp');

  // Dữ liệu gốc không bị đổi bởi việc chọn xem
  const saved = JSON.parse(w.localStorage.getItem('ads-eval-v1-s@e.com'));
  const rows = saved.byAcc.act_1.days[today];
  check(rows.length === 4 && rows.every(r => !('picked' in r)), 'dữ liệu từng ngày không bị đổi (chọn xem chỉ là bộ lọc hiển thị)');
  check(errors.length === 0, 'không lỗi JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
