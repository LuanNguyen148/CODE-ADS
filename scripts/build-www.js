// Gom web tĩnh vào thư mục www/ để Capacitor đóng gói thành ứng dụng iPhone (.ipa). Không build gì: chỉ chép file.
// Chạy: node scripts/build-www.js
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'www');
const FILES = ['index.html', 'dashboard.html'];
const DIRS = ['css', 'js', 'image', 'audio', 'font'];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
for (const d of DIRS) fs.cpSync(path.join(ROOT, d), path.join(OUT, d), { recursive: true });
// Trong ứng dụng: không cho phóng to bằng hai ngón (tránh trang bị zoom lệch) — chỉ áp dụng cho bản www/, web thật giữ nguyên
for (const f of FILES) {
  const p = path.join(OUT, f), h = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, h.replace(/(<meta name="viewport" content=")([^"]*)(")/, (m, a, b, c) => a + b.replace(/,?\s*(maximum-scale|user-scalable)=[^,]*/g, '') + ', maximum-scale=1, user-scalable=no' + c));
}
let n = 0; (function walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) e.isDirectory() ? walk(path.join(p, e.name)) : n++; })(OUT);
console.log('Đã chép ' + n + ' file vào www/');
