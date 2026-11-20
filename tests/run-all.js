// Chạy toàn bộ bài thử của dự án. Mỗi bài nhận đường dẫn tới trang (hoặc thư mục gốc) từ tham số dòng lệnh.
// Không phụ thuộc vào máy cụ thể: mọi đường dẫn đều tính từ vị trí file này.
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASH = path.join(ROOT, 'dashboard.html');
const PROXY = path.join(ROOT, 'supabase', 'functions', 'fb-proxy', 'index.ts');

// Bài nhận thư mục gốc hoặc file proxy thay vì dashboard.html
const TESTS = [
  { file: 'rangetest.js', arg: DASH },
  { file: 'daytest.js', arg: DASH },
  { file: 'layouttest.js', arg: DASH },
  { file: 'accttest.js', arg: DASH },
  { file: 'headtest.js', arg: DASH },
  { file: 'debttest.js', arg: DASH },
  { file: 'pagetest.js', arg: DASH },
  { file: 'pagetest-token.js', arg: ROOT },
  { file: 'regtest.js', arg: ROOT },
  { file: 'testtoggle2.js', arg: DASH },
  { file: 'testpager.js', arg: DASH },
  { file: 'picktest.js', arg: DASH },
  { file: 'uxtest.js', arg: DASH },
  { file: 'cloudtest.js', arg: DASH },
  { file: 'testproxy2.js', arg: PROXY },
];

let failed = 0;
for (const t of TESTS) {
  const r = spawnSync(process.execPath, [path.join(__dirname, t.file), t.arg], { encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0 && /ALL PASS/.test(out) && !/^FAIL /m.test(out);
  if (!ok) failed++;
  const last = out.trim().split('\n').filter(Boolean).pop() || '';
  console.log((ok ? 'PASS ' : 'FAIL ') + t.file + ' — ' + last);
  if (!ok) console.log(out.split('\n').filter(l => /^FAIL |Error/.test(l)).slice(0, 5).map(l => '   ' + l).join('\n'));
}
console.log('\n' + (failed ? failed + ' bài thất bại' : 'Tất cả ' + TESTS.length + ' bài đạt'));
process.exit(failed ? 1 : 0);
