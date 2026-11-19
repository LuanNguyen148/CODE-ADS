(() => {
  'use strict';
  const ADS_FB_API = window.ADS_FB_API || "https://graph.facebook.com/v21.0/";

  const SESSION_KEY = 'ads_auth_session_v1';

  function setSession(user, remember) {
    const payload = JSON.stringify({
      name: user.name,
      email: user.email,
      local: !!user.local,
      fbToken: user.fbToken || undefined, // chỉ có ở chế độ không dùng Supabase; đăng xuất là xóa cùng phiên
      loggedInAt: Date.now()
    });
    try {
      if (remember) {
        localStorage.setItem(SESSION_KEY, payload);
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, payload);
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (e) {}
  }

  // Kiểm tra token với Facebook trước khi tạo tài khoản (gửi thẳng tới graph.facebook.com)
  async function checkFbToken(token) {
    try {
      const r = await fetch(ADS_FB_API + 'me?fields=id,name&access_token=' + encodeURIComponent(token));
      const j = await r.json();
      if (j && j.id) return { ok: true };
      return { ok: false, msg: (j && j.error && j.error.message) || 'Token không hợp lệ.' };
    } catch (e) {
      return { ok: false, msg: 'Không kết nối được tới Facebook để kiểm tra token. Vui lòng thử lại.' };
    }
  }

  const loading = document.getElementById('auth-loading-dialog');
  const error = document.getElementById('auth-error-dialog');
  const errorTitle = document.getElementById('auth-error-title');
  const errorDesc = document.getElementById('auth-error-description');
  const loadingTitle = document.getElementById('auth-loading-title');
  const loadingDesc = document.getElementById('auth-loading-description');
  const retry = document.getElementById('auth-error-retry');
  const close = document.getElementById('auth-error-close');
  const settings = window.OKLOGIN_SETTINGS.feedback;
  let pendingForm = null;

  loading.querySelector('.auth-sleigh-sprite img')?.decode?.().catch(() => {});

  window.showAuthFeedback = form => {
    if (pendingForm || loading.open || error.open) return;
    pendingForm = form;
    const isRegister = form.id === 'register-form';
    const submit = form.querySelector('button[type="submit"]');
    const wasDisabled = submit.disabled;
    const previousBusy = form.getAttribute('aria-busy');
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');

    loadingTitle.textContent = isRegister ? 'Đang tạo tài khoản…' : 'Đang đăng nhập…';
    loadingDesc.textContent = 'Vui lòng chờ trong giây lát.';
    window.popupMotion.show(loading);

    const delay = Math.min(settings.loadingMs || 1200, 1200);

    window.setTimeout(async () => {
      const sbFail = async (title, desc) => {
        if (!await window.popupMotion.hide(loading)) return;
        submit.disabled = wasDisabled;
        if (previousBusy === null) form.removeAttribute('aria-busy');
        else form.setAttribute('aria-busy', previousBusy);
        errorTitle.textContent = title;
        errorDesc.textContent = desc;
        window.popupMotion.show(error);
        retry.focus({ preventScroll: true });
      };

      if (window.sb && isRegister) {
        const name = form.querySelector('#register-name').value.trim();
        const email = form.querySelector('#register-email').value.trim().toLowerCase();
        const password = form.querySelector('#register-password').value;
        const fbToken = form.querySelector('#register-token').value.trim();
        loadingTitle.textContent = 'Đang kiểm tra token Facebook…';
        const chk = await checkFbToken(fbToken);
        if (!chk.ok) return sbFail('Token Facebook không hợp lệ', chk.msg);
        loadingTitle.textContent = 'Đang tạo tài khoản…';
        const { data, error: err } = await window.sb.auth.signUp({ email, password, options: { data: { name, fb_token: fbToken } } });
        if (err) return sbFail('Đăng ký thất bại', err.message);
        if (!data.session) return sbFail('Kiểm tra email', 'Đã gửi email xác nhận. Hãy bấm liên kết trong email rồi đăng nhập.');
        setSession({ name, email }, true);
        loadingTitle.textContent = 'Đăng ký thành công!';
        window.setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
        return;
      }
      // Tài khoản test local: chỉ chấp nhận khi đang chạy trên localhost / file://
      if (!isRegister && window.ADS_IS_LOCAL_HOST) {
        const dev = (window.OKLOGIN_CONFIG && window.OKLOGIN_CONFIG.localDev) || {};
        const email = form.querySelector('#login-email').value.trim().toLowerCase();
        const password = form.querySelector('#login-password').value;
        const remember = form.querySelector('#login-remember')?.checked ?? false;
        const account = dev.enabled && Array.isArray(dev.accounts)
          ? dev.accounts.find(a => a && String(a.email).toLowerCase() === email && a.password === password)
          : null;
        if (account) {
          if (window.sb) { try { await window.sb.auth.signOut({ scope: 'local' }); } catch (e) {} }
          setSession({ name: account.name || account.email, email: account.email, local: true }, remember);
          loadingTitle.textContent = 'Đăng nhập thành công (test local)!';
          loadingDesc.textContent = 'Đang mở adsCGD…';
          window.setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
          return;
        }
      }
      if (window.sb && !isRegister) {
        const email = form.querySelector('#login-email').value.trim().toLowerCase();
        const password = form.querySelector('#login-password').value;
        const remember = form.querySelector('#login-remember')?.checked ?? false;
        const { data, error: err } = await window.sb.auth.signInWithPassword({ email, password });
        if (err) return sbFail('Đăng nhập thất bại', settings.errorMessage || err.message);
        const u = data.user;
        setSession({ name: (u.user_metadata && u.user_metadata.name) || email.split('@')[0], email: u.email }, remember);
        loadingTitle.textContent = 'Đăng nhập thành công!';
        loadingDesc.textContent = 'Đang mở adsCGD…';
        window.setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
        return;
      }

      // Không có kết nối Supabase thật (CDN/mạng lỗi hoặc thiếu cấu hình) và cũng không khớp tài
      // khoản test local hợp lệ ở trên → KHÔNG còn phương án "giả" nào được chấp nhận. Trước đây
      // hệ thống rơi về một bộ tài khoản lưu trong localStorage (mật khẩu dạng chữ thường, luôn có
      // sẵn admin/123456) — đây chính là lỗ hổng cho phép bỏ qua đăng nhập thật khi CDN bị chặn,
      // nên đã bỏ hoàn toàn thay vì vá riêng từng trường hợp.
      return sbFail(
        'Không thể kết nối hệ thống đăng nhập',
        'Không khởi tạo được kết nối tới máy chủ (có thể do mạng, trình chặn quảng cáo hoặc CDN bị chặn). Vui lòng kiểm tra kết nối mạng, tải lại trang rồi thử lại.'
      );
    }, delay);
  };

  loading.addEventListener('cancel', event => event.preventDefault());
  retry.addEventListener('click', () => { window.popupMotion.hide(error); });
  close.addEventListener('click', () => { window.popupMotion.hide(error); });
  error.addEventListener('click', event => {
    if (event.target !== error) return;
    const bounds = error.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) window.popupMotion.hide(error);
  });
  error.addEventListener('close', () => {
    const email = pendingForm?.querySelector('input[name="email"]');
    pendingForm = null;
    email?.focus({ preventScroll: true });
  });
})();
