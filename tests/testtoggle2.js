// Sandbox test: toggle tab shows ALL Facebook objects (incl. unspent), paginates, still toggles.
const vm = require('vm');
const h = require('fs').readFileSync(process.argv[2], 'utf8');
const main = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('CHỨC NĂNG BẬT / TẮT'));
const s = main.indexOf('// ================= CHỨC NĂNG BẬT / TẮT');
const e = main.indexOf('$("tg-list").addEventListener("change"');
const block = main.slice(s, main.indexOf('});', e) + 3);

const els = {}, listeners = {}, toasts = [], requests = [];
const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', disabled: false, addEventListener(t, f) { listeners[id + ':' + t] = f; } });
const page = (data, after) => ({ data, paging: after ? { cursors: { after }, next: 'https://graph.facebook.com/next' } : { cursors: {} } });
const fb = {
  campaigns: [page([{ id: 'C1', name: 'Camp đang tiêu', status: 'ACTIVE' }, { id: 'C2', name: 'Camp chưa tiêu', status: 'PAUSED' }, { id: 'C9', name: 'Camp đã xóa', status: 'PAUSED', effective_status: 'DELETED' }])],
  adsets: [page([{ id: 'A1', name: 'Set 1', status: 'ACTIVE', campaign_id: 'C1' }, { id: 'A2', name: 'Set 2', status: 'PAUSED', campaign_id: 'C2' }])],
  ads: [
    page([{ id: 'AD1', name: 'QC đã tiêu', status: 'ACTIVE', campaign_id: 'C1', adset_id: 'A1' }], 'CUR1'),
    page([{ id: 'AD2', name: 'QC chưa tiêu trang 2', status: 'PAUSED', campaign_id: 'C2', adset_id: 'A2' }]),
  ],
};
let postReply = { success: true };
const ctx = {
  console, String, Object, Array, Date, Promise, encodeURIComponent, decodeURIComponent,
  document: { querySelectorAll: () => [], addEventListener() {} },
  $: el, fbCfg: { token: 'TK' },
  S: { tab: 'toggle', day: '2026-11-19', rows: [
    { campaign: 'Camp đang tiêu', campaign_id: 'C1', adset: 'Set 1', adset_id: 'A1', name: 'QC đã tiêu', ad_id: 'AD1', spend: '150k', accountId: 'act_1' },
  ] },
  dpRange: null, dpRangeRows: null, VR: function () { return ctx.S.rows; },
  ALL_ACC: '__all__', ADS_FB_API: 'https://graph.facebook.com/v21.0/', currentAccountId: 'act_1', currentAccountName: 'TK 1',
  isAll: () => false, listAccountIds: () => ['act_1'],
  dm: d => d, toast: m => toasts.push(m), esc: x => String(x), fd: x => String(x), money: x => String(x), pct: x => String(x),
  gr: () => 'g', shortAcc: x => x, shortId: x => x, sortList: l => l,
  total: rows => ({ s: rows.reduce((a, r) => a + (r.spend ? 150000 : 0), 0), m: 0, cp: NaN }),
  fetch: (url, opts) => {
    requests.push({ url, opts });
    if (opts && opts.method === 'POST') return Promise.resolve({ json: () => Promise.resolve(postReply) });
    const kind = (url.match(/\/act_1\/(campaigns|adsets|ads)\?/) || [])[1];
    const pages = fb[kind] || [{}];
    const idx = /&after=CUR1/.test(url) ? 1 : 0;
    return Promise.resolve({ json: () => Promise.resolve(pages[idx]) });
  },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(block + ';this.__api={renderToggleView, get live(){return fbLiveObjects}, get cache(){return fbStatusCache}, setLvl(v){tgLvl=v}};', ctx);
const api = ctx.__api;
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };

(async () => {
  let ok = true;
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  api.renderToggleView(true);
  await flush();
  const list = () => els['tg-list'].innerHTML;

  check(requests.some(r => /fields=id,name,status,effective_status,campaign_id,adset_id/.test(decodeURIComponent(r.url))), 'lấy thêm tên và ID cấp cha');
  check(requests.filter(r => /\/ads\?/.test(r.url)).length === 2, 'tải tiếp trang 2 của danh sách quảng cáo');
  check(api.live['act_1'] && api.live['act_1'].campaigns.length === 2, 'bỏ chiến dịch đã xóa (DELETED)');

  check(/Camp đang tiêu/.test(list()) && /Camp chưa tiêu/.test(list()), 'cấp Chiến dịch: hiện cả chiến dịch CHƯA tiêu tiền');
  check(!/Camp đã xóa/.test(list()), 'cấp Chiến dịch: không hiện chiến dịch đã xóa');
  check(/data-tg-id="C2"/.test(list()) && !/data-tg-id="C2"[^>]*disabled/.test(list()), 'chiến dịch chưa tiêu vẫn có công tắc bật/tắt được');

  api.setLvl('ad'); api.renderToggleView(false);
  check(/QC đã tiêu/.test(list()) && /QC chưa tiêu trang 2/.test(list()), 'cấp Quảng cáo: hiện cả QC chưa tiêu (từ trang 2)');
  check((list().match(/data-tg-id="AD1"/g) || []).length === 1, 'QC đã tiêu chỉ có 1 dòng (không trùng)'); console.log('   (tên xuất hiện ' + (list().match(/QC đã tiêu/g) || []).length + ' lần: 1 ở tên + 1 ở aria-label công tắc)');
  check(/Chi: <b>150000<\/b>/.test(list()) && /Chi: <b>0<\/b>/.test(list()), 'gắn đúng số chi tiêu (150k và 0)');

  requests.length = 0;
  listeners['tg-list:change']({ target: { checked: true, dataset: { tgId: 'AD2' } } });
  await flush();
  const post = requests.find(r => r.opts && r.opts.method === 'POST');
  check(post && /\/v21\.0\/AD2\?/.test(post.url) && post.opts.body === 'status=ACTIVE', 'bật QC chưa tiêu → POST status=ACTIVE đúng ID');
  check(api.cache['AD2'].status === 'ACTIVE', 'sau khi bật: trạng thái ACTIVE');

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
})();
