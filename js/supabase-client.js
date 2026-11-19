/* Kết nối Supabase: Auth + lưu dữ liệu dashboard + proxy Facebook (token nằm trên server) */
(function(){
  'use strict';
  var cfg=(window.OKLOGIN_CONFIG&&window.OKLOGIN_CONFIG.supabase)||{};
  window.sb=null;
  // Phiên đăng nhập bằng tài khoản test local (chỉ trên localhost) → chạy offline, không dùng Supabase
  var localSession=false;
  try{
    var s=JSON.parse(localStorage.getItem('ads_auth_session_v1')||sessionStorage.getItem('ads_auth_session_v1')||'null');
    localSession=!!(s&&s.local&&window.ADS_IS_LOCAL_HOST);
  }catch(e){}
  window.ADS_LOCAL_SESSION=localSession;
  if(!localSession&&cfg.url&&cfg.anonKey&&window.supabase&&window.supabase.createClient){
    window.sb=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true}});
  }
  var timer=null,pending=null;
  window.ADS_CLOUD={
    on:!!window.sb,
    // Lấy dữ liệu đã lưu; trả về {state, updated_at} hoặc null
    async pull(){
      if(!window.sb)return null;
      var r=await window.sb.from('ads_user_state').select('state,updated_at').maybeSingle();
      return r.error?null:r.data;
    },
    // Ghi dữ liệu lên cloud (gộp lần ghi liên tiếp, chờ 0,8 giây). opts.notify = true khi người dùng nhập tay SĐT/doanh số
    push(state,opts){
      if(!window.sb)return;
      pending={state:state,notify:!!(opts&&opts.notify)||(pending&&pending.notify)};
      clearTimeout(timer);
      timer=setTimeout(function(){ADS_CLOUD.flush()},800);
    },
    // Ghi ngay dữ liệu đang chờ lên Supabase (gọi khi rời trang / ẩn tab)
    async flush(){
      clearTimeout(timer);
      if(!window.sb||!pending)return;
      var job=pending;pending=null;
      try{
        var s=await window.sb.auth.getSession();var u=s.data&&s.data.session&&s.data.session.user;
        if(!u)throw new Error('Chưa đăng nhập Supabase');
        var r=await window.sb.from('ads_user_state').upsert({user_id:u.id,state:job.state,updated_at:new Date().toISOString()});
        if(r.error)throw new Error(r.error.message);
        if(job.notify&&typeof ADS_CLOUD.onSaved==='function')ADS_CLOUD.onSaved();
      }catch(e){
        console.warn('Supabase lưu lỗi:',e.message);
        pending=pending||job; // giữ lại để thử đẩy lại lần sau
        if(typeof ADS_CLOUD.onError==='function')ADS_CLOUD.onError(e.message);
      }
    },
    // fetch tới Facebook Graph qua Edge Function (hỗ trợ cả GET & POST, token nằm trên server)
    async fb(url,opts){
      if(!window.sb)return fetch(url,opts);
      var u=new URL(url);u.searchParams.delete('access_token');
      var s=await window.sb.auth.getSession();var t=s.data&&s.data.session&&s.data.session.access_token;
      var reqOpts=Object.assign({},opts||{});
      reqOpts.headers=Object.assign({},(opts&&opts.headers)||{}, {Authorization:'Bearer '+t,apikey:cfg.anonKey});
      return fetch(cfg.url+'/functions/v1/fb-proxy?path='+encodeURIComponent(u.pathname+u.search),reqOpts);
    }
  };
  // Rời trang hoặc chuyển tab thì đẩy ngay dữ liệu chưa kịp lưu
  window.addEventListener('pagehide',function(){window.ADS_CLOUD.flush()});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')window.ADS_CLOUD.flush()});
})();
