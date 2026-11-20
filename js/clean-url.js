/* Địa chỉ gọn trên web đã deploy: /dashboard.html → /dashboard, /index.html → /.
 * Chỉ đổi chữ trên thanh địa chỉ (history.replaceState), không tải lại trang.
 * Netlify mở /dashboard bằng dashboard.html (xem file _redirects).
 * Chạy local (localhost, 127.0.0.1, file://) thì giữ nguyên vì máy chủ local không hiểu /dashboard. */
(function () {
  try {
    var l = window.location;
    if (!/^https?:$/.test(l.protocol)) return;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(l.hostname) || /\.localhost$/.test(l.hostname)) return;
    var p = l.pathname, q = null;
    if (/\/index\.html$/.test(p)) q = p.slice(0, -"index.html".length);
    else if (/\.html$/.test(p)) q = p.slice(0, -".html".length);
    if (q !== null && window.history && history.replaceState) history.replaceState(history.state, "", q + l.search + l.hash);
  } catch (e) {}
})();
