// Phong cách kính mờ: khối v33 chỉ áp dụng ở chế độ Tối, khối v34 chỉ áp dụng ở chế độ Sáng.
// Mỗi bộ chọn phải bắt đầu bằng :root[data-scene="..."] tương ứng, để hai chế độ không đè lên nhau. Kiểm tra cả dấu ngoặc.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
const css = html.match(/<style>([\s\S]*?)<\/style>/g).join('\n');

function audit(tag, scene, other, minRules = 20) {
  const start = css.indexOf('/* ===== ' + tag + ':');
  check(start > 0, tag + ': có khối CSS');
  const end = css.indexOf('/* ===== hết ' + tag + ' ===== */', start);
  check(end > start, tag + ': có dấu kết thúc khối');
  const block = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  check((block.match(/{/g) || []).length === (block.match(/}/g) || []).length, tag + ': dấu { } cân bằng');
  const prefix = ':root[data-scene="' + scene + '"]';
  const bad = []; let rules = 0, depth = 0, buf = '';
  const chk = s => { rules++; s.split(',').map(x => x.trim()).filter(Boolean).forEach(x => { if (!x.startsWith(prefix)) bad.push(x); }); };
  for (const ch of block) {
    if (ch === '{') { const sel = buf.trim(); buf = ''; if ((depth === 0 || depth === 1) && !sel.startsWith('@')) chk(sel); depth++; }
    else if (ch === '}') { depth--; buf = ''; }
    else if (depth <= 1) buf += ch;
  }
  check(rules >= minRules, tag + ' có ' + rules + ' luật');
  check(bad.length === 0, tag + ': mọi bộ chọn đều giới hạn ở chế độ ' + (scene === 'night' ? 'Tối' : 'Sáng') + (bad.length ? ' — sai: ' + bad.slice(0, 3).join(' | ') : ''));
  check(!block.includes('data-scene="' + other + '"'), tag + ' không đụng tới chế độ còn lại');
  // Làm mờ nền (nặng) chỉ dùng cho vài thẻ lớn, không gắn cho từng thẻ trong danh sách
  const blurSel = (block.match(/([^{}]+){[^{}]*backdrop-filter[^{}]*}/g) || []).join(' ');
  check(!/drill-card|\.vid\b/.test(blurSel), tag + ': không dùng backdrop-filter cho từng thẻ trong danh sách (giữ máy nhẹ)');
}
audit('v33', 'night', 'day');
audit('v34', 'day', 'night');
audit('v36', 'day', 'night', 8);
// Ô Doanh số / Số ĐT (ô sửa được ở thẻ Chiến dịch, Nhóm QC) phải CÙNG MÀU với các ô còn lại, không nền trắng riêng
{
  const s = css.indexOf('/* ===== v36:'), e = css.indexOf('/* ===== hết v36 ===== */', s);
  const b36 = css.slice(s, e).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = b36.match(/[^{}]+{[^{}]*}/g) || [];
  const editWhite = rules.filter(r => /\.drill-cell\.edit\s*[,{]/.test(r.split('{')[0]) && /background:\s*#fff\b/i.test(r));
  check(editWhite.length === 0, 'ô sửa được (.drill-cell.edit) không có nền trắng riêng — cùng màu với các ô còn lại');
  check(rules.some(r => /\.drill-cell:not\(\.key\)/.test(r.split('{')[0]) && /background:#efe2cf/.test(r)), 'mọi ô (kể cả ô sửa được) dùng chung nền #efe2cf trừ ô "Tiền chạy" nổi bật');
}
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 2);
