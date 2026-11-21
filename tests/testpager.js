// Sandbox test: pagination of the toggle list.
const vm = require('vm');
const h = require('fs').readFileSync(process.argv[2], 'utf8');
const main = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('CHỨC NĂNG BẬT / TẮT'));
const s = main.indexOf('// ================= CHỨC NĂNG BẬT / TẮT');
const e = main.indexOf('$("tg-list").addEventListener("change"');
const block = main.slice(s, main.indexOf('});', e) + 3);

const els = {}, listeners = {}, store = {};
const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', hidden: true, disabled: false,
  addEventListener(t, f) { listeners[id + ':' + t] = f; }, getBoundingClientRect: () => ({ top: 100 }), scrollIntoView() {} });
const ads = Array.from({ length: 45 }, (_, i) => ({ id: 'AD' + (i + 1), name: 'QC ' + String(i + 1).padStart(2, '0'), status: i % 2 ? 'PAUSED' : 'ACTIVE', campaign_id: 'C1', adset_id: 'A1' }));
const ctx = {
  console, String, Object, Array, Date, Promise, Math, parseInt, encodeURIComponent, RM: true,
  window: { innerHeight: 800 }, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  document: { querySelectorAll: () => [], addEventListener() {} }, $: el, fbCfg: { token: 'TK' },
  S: { tab: 'toggle', day: '2026-11-19', rows: [] },
  dpRange: null, dpRangeRows: null, VR: function () { return ctx.S.rows; },
  dpToday: () => ctx.S.day, dpAggregate: () => ctx.S.rows,
  ALL_ACC: '__all__', ADS_FB_API: 'https://graph.facebook.com/v21.0/', currentAccountId: 'act_1', currentAccountName: 'TK 1', isAll: () => false, listAccountIds: () => ['act_1'],
  dm: d => d, toast() {}, esc: x => String(x), fd: x => String(x), money: x => String(x), pct: x => String(x), gr: () => 'g',
  shortAcc: x => x, shortId: x => x, sortList: l => l, total: () => ({ s: 0, m: 0, cp: NaN }),
  fetch: url => {
    const kind = (url.match(/\/act_1\/(campaigns|adsets|ads)\?/) || [])[1];
    const data = { campaigns: [{ id: 'C1', name: 'Camp', status: 'ACTIVE' }], adsets: [{ id: 'A1', name: 'Set', status: 'ACTIVE', campaign_id: 'C1' }], ads }[kind] || [];
    return Promise.resolve({ json: () => Promise.resolve({ data, paging: {} }) });
  },
};
vm.createContext(ctx);
vm.runInContext(block + ';this.__api={renderToggleView, setLvl(v){tgLvl=v}, setFilter(v){tgStatusFilter=v}};', ctx);
const api = ctx.__api;
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
const rows = () => (els['tg-list'].innerHTML.match(/class="tg-row/g) || []).length;
const names = () => [...els['tg-list'].innerHTML.matchAll(/>(QC \d\d)</g)].map(m => m[1]);
const clickPage = p => listeners['tg-pager:click']({ target: { closest: () => ({ disabled: false, dataset: { tgPage: String(p) } }) } });

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  api.renderToggleView(true); await flush();
  api.setLvl('ad'); api.renderToggleView(false);
  const pg = () => els['tg-pager'].innerHTML;

  // Mặc định 10 mục/trang; ở bộ lọc "Tất cả", quảng cáo ĐANG BẬT đứng trước (45 QC: 23 bật = QC lẻ, 22 tắt = QC chẵn)
  check(rows() === 10 && names()[0] === 'QC 01' && names()[9] === 'QC 19', 'trang 1: 10 mục, toàn quảng cáo đang bật (QC 01,03…19)');
  check(!els['tg-pager'].hidden && pg().includes('Hiển thị <b>1–10</b> / <b>45</b>'), 'thanh phân trang: "Hiển thị 1–10 / 45"');
  check(/aria-label="Trang trước" disabled/.test(pg()) && /aria-label="Trang 5"/.test(pg()), 'nút ‹ bị khóa ở trang 1, có 5 trang');

  clickPage(3);
  check(names()[2] === 'QC 45' && names()[3] === 'QC 02', 'trang 3: quảng cáo bật cuối cùng (QC 45) rồi mới tới quảng cáo tắt (QC 02)');
  clickPage(5);
  check(rows() === 5 && names()[0] === 'QC 36', 'trang 5: 5 mục cuối (toàn quảng cáo tắt)');
  check(/aria-label="Trang sau" disabled/.test(pg()), 'nút › bị khóa ở trang cuối');

  clickPage(2); api.renderToggleView(false); // như sau khi bật/tắt một mục
  check(names()[0] === 'QC 21', 'vẽ lại (vd. sau khi bật/tắt) vẫn giữ trang 2');

  api.setFilter('ACTIVE'); api.renderToggleView(false);
  check(names()[0] === 'QC 01' && pg().includes('/ <b>23</b>'), 'đổi bộ lọc "Đang chạy" → về trang 1, còn 23 mục');

  api.setFilter('PAUSED'); api.renderToggleView(false);
  check(names()[0] === 'QC 02' && pg().includes('/ <b>22</b>'), 'bộ lọc "Đã tắt": giữ thứ tự gốc, còn 22 mục');

  api.setFilter('ACTIVE'); api.renderToggleView(false);
  listeners['tg-pager:change']({ target: { id: 'tg-pg-size', value: '50' } });
  check(rows() === 23 && els['tg-pager'].innerHTML.includes('Hiển thị <b>1–23</b>'), 'chọn 50 mục/trang → hiện đủ 23 mục');
  check(store['ads_tg_pagesize_v2'] === '50', 'nhớ lựa chọn 50 mục/trang');
  api.setFilter('all'); listeners['tg-pager:change']({ target: { id: 'tg-pg-size', value: '10' } });
  api.setLvl('campaign'); api.renderToggleView(false);
  check(els['tg-pager'].hidden === true, 'ít mục (1 chiến dịch) → ẩn thanh phân trang');

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
})();
