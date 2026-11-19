(function () {
  'use strict';
  var WAIT_MS = 3000;        // thời gian hiện popup trước khi về trang đăng nhập
  var SIGNOUT_CAP_MS = 2500; // tối đa chờ Supabase signOut, tránh kẹt
  var SESSION_KEY = 'ads_auth_session_v1';
  var LOGIN_URL = 'index.html';

  var dlg = document.getElementById('logout-dialog');
  var img = dlg && dlg.querySelector('.logout-sleigh img');
  if (!dlg) return;

  var running = false, prefetched = false;

  function loadSleigh() {
    if (img && !img.getAttribute('src')) img.setAttribute('src', img.getAttribute('data-src'));
  }
  // Tải ảnh xe tuần lộc khi trình duyệt rảnh, không làm chậm lúc mở dashboard
  if (window.requestIdleCallback) window.addEventListener('load', function () { requestIdleCallback(loadSleigh, { timeout: 4000 }); });
  else window.addEventListener('load', function () { setTimeout(loadSleigh, 2000); });

  // Đăng xuất: xóa phiên đăng nhập (gồm token Facebook nếu có) và mọi token cũ còn sót trong trình duyệt
  function clearLocal() {
    try {
      localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('ads_fb_config_v3');
      var c = JSON.parse(localStorage.getItem('ads_fb_config_v4') || 'null');
      if (c && c.token) { delete c.token; localStorage.setItem('ads_fb_config_v4', JSON.stringify(c)); }
    } catch (e) {}
  }

  function pauseScene() {
    document.documentElement.setAttribute('data-logging-out', '');
    if (window.xmasSnow) window.xmasSnow.setPaused(true);
  }

  // Tải sẵn trang đăng nhập + ảnh/CSS/JS của nó vào cache trong lúc chờ
  function prefetchLogin() {
    if (prefetched || !window.fetch) return;
    prefetched = true;
    var base = new URL(LOGIN_URL, location.href);
    fetch(base.href, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
      var seen = {}, urls = [], re = /(?:href|src|data-app-src|data-svg-src)\s*=\s*"([^"#]+)"/g, m;
      while ((m = re.exec(html))) {
        var raw = m[1];
        if (/^(?:[a-z]+:)?\/\//i.test(raw) || /^(?:data|mailto|javascript):/i.test(raw)) continue;
        var u;
        try { u = new URL(raw, base).href; } catch (e) { continue; }
        if (/\.html?(\?|$)/i.test(u) || seen[u]) continue;
        seen[u] = 1; urls.push(u);
      }
      var i = 0, active = 0, MAX = 3;
      (function next() {
        while (active < MAX && i < urls.length) {
          active++;
          fetch(urls[i++], { credentials: 'same-origin' }).catch(function () {}).then(function () { active--; next(); });
        }
      })();
    }).catch(function () {});
  }

  function finish() {
    clearLocal();
    var go = function () { window.location.replace(LOGIN_URL); };
    if (window.sb) {
      var done = false, once = function () { if (!done) { done = true; go(); } };
      setTimeout(once, SIGNOUT_CAP_MS);
      try { window.sb.auth.signOut().then(once, once); } catch (e) { once(); }
    } else go();
  }

  function open() {
    if (running) return;
    running = true;
    loadSleigh();
    pauseScene();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    // Cho popup vẽ xong khung đầu rồi mới bắt đầu tải trang đăng nhập
    setTimeout(prefetchLogin, 400);
    setTimeout(finish, WAIT_MS);
  }

  dlg.addEventListener('cancel', function (e) { e.preventDefault(); }); // không cho Esc đóng giữa chừng

  window.ADS_LOGOUT_POPUP = { open: open };
})();
