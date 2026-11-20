// Run fb-proxy/index.ts in Node (types stripped) with mocked Deno + fetch: per-user token rules.
const fs = require('fs');
let src = fs.readFileSync(process.argv[2], 'utf8')
  .replace(/\(status: number, message: string\)/, '(status, message)')
  .replace(/\(req: Request\): Promise<\{ email: string; fbToken: string \} \| null>/, '(req)')
  .replace(/const init: RequestInit =/, 'const init =')
  // bỏ chú thích kiểu đơn giản của TypeScript để chạy bằng Node
  .replace(/\)\s*:\s*(unknown|string|Promise<[^>{]*>)\s*\{/g, ') {')
  .replace(/(\w)\s*:\s*(string|number|unknown|Request|Response|boolean)(?=\s*[,)=])/g, '$1');
if (/\)\s*:\s*Promise|:\s*(RequestInit|Request)\b|:\s*(number|string)\)/.test(src)) throw new Error('TS annotation left');

let handler, env = {}, graphCalls = [];
global.Deno = { serve: h => { handler = h; }, env: { get: k => env[k] } };
const users = {
  OWNER: { email: 'Owner@Example.com' },                                   // tài khoản cũ, chưa có token riêng
  NEWBIE: { email: 'new@example.com', user_metadata: { fb_token: ' EAAnewbie ' } }, // đăng ký kèm token
  OTHER: { email: 'stranger@example.com' },                               // không token, không trong danh sách
};
global.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.endsWith('/auth/v1/user')) {
    const u = users[(init.headers.Authorization || '').replace('Bearer ', '')];
    return u ? new Response(JSON.stringify(u), { status: 200 }) : new Response('{}', { status: 401 });
  }
  graphCalls.push({ url, init });
  if (/\/me\/accounts/.test(url)) return new Response(JSON.stringify({ data: [{ id: '111', name: 'Shop Noel', access_token: 'PAGETOKEN111', nested: { access_token: 'X' } }] }), { status: 200 });
  return new Response('{"success":true}', { status: 200 });
};
new Function(src)();
const base = 'https://x.supabase.co/functions/v1/fb-proxy?path=';
const call = (method, path, auth, body) => handler(new Request(base + encodeURIComponent(path), {
  method, body, headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, auth ? { authorization: 'Bearer ' + auth } : {}),
}));
(async () => {
  let ok = true;
  const expect = async (name, p, status, extra) => {
    graphCalls = [];
    const r = await p; const txt = await r.text();
    const pass = r.status === status && (!extra || extra(txt));
    console.log((pass ? 'PASS ' : 'FAIL ') + name + ' → ' + r.status + (pass ? '' : ' ' + txt + ' ' + JSON.stringify(graphCalls.map(c => c.url))));
    if (!pass) ok = false;
  };
  const usedToken = () => graphCalls.length === 1 ? new URL(graphCalls[0].url).searchParams.get('access_token') : null;
  env = { FB_ACCESS_TOKEN: 'SERVERTOKEN', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', ALLOWED_EMAILS: 'owner@example.com' };

  await expect('không đăng nhập → 401', call('GET', '/v21.0/me/adaccounts'), 401, () => graphCalls.length === 0);
  await expect('TK mới đăng ký kèm token → dùng token CỦA CHÍNH MÌNH', call('GET', '/v21.0/me/adaccounts', 'NEWBIE'), 200, () => usedToken() === 'EAAnewbie');
  await expect('TK cũ (trong ALLOWED_EMAILS) → dùng token dự phòng của server', call('GET', '/v21.0/me/adaccounts', 'OWNER'), 200, () => usedToken() === 'SERVERTOKEN');
  await expect('TK không token, không trong danh sách → 403, không gọi Facebook', call('GET', '/v21.0/me/adaccounts', 'OTHER'), 403, t => graphCalls.length === 0 && /chưa có Facebook Access Token/.test(t));
  await expect('TK mới bật/tắt bằng token của mình', call('POST', '/v21.0/123', 'NEWBIE', 'status=PAUSED'), 200, () => usedToken() === 'EAAnewbie' && graphCalls[0].init.body === 'status=PAUSED');
  await expect('vẫn chặn POST sửa ngân sách', call('POST', '/v21.0/123', 'NEWBIE', 'daily_budget=1'), 400, () => graphCalls.length === 0);
  await expect('tự gắn access_token lạ → bị thay bằng token của tài khoản', call('GET', '/v21.0/me?access_token=HACK', 'NEWBIE'), 200, () => usedToken() === 'EAAnewbie');
  await expect('/me/accounts?fields=access_token → gỡ mọi access_token (Page token không tới trình duyệt)', call('GET', '/v21.0/me/accounts?fields=id,access_token', 'NEWBIE'), 200, t => /Shop Noel/.test(t) && !/PAGETOKEN|access_token/.test(t));
  await expect('đã bỏ phần tin nhắn: ?op=… không còn đường riêng (không có path → 400)', handler(new Request('https://x.supabase.co/functions/v1/fb-proxy?op=send&page=111', { method: 'POST', body: '{"to":"1","text":"hi"}', headers: { authorization: 'Bearer NEWBIE' } })), 400, () => graphCalls.length === 0);
  env.ALLOWED_EMAILS = '';
  await expect('không đặt ALLOWED_EMAILS: TK mới vẫn chạy', call('GET', '/v21.0/me', 'NEWBIE'), 200);
  await expect('không đặt ALLOWED_EMAILS: TK cũ không còn token dự phòng → 403', call('GET', '/v21.0/me', 'OWNER'), 403);
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
})();
