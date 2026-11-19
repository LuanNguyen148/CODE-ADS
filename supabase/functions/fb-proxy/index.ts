// Edge Function: chuyển tiếp yêu cầu tới Facebook Graph API bằng token Facebook của chính người đang đăng nhập.
//
// MỖI TÀI KHOẢN DÙNG TOKEN FACEBOOK CỦA CHÍNH MÌNH (nhập khi đăng ký, lưu ở user_metadata.fb_token).
// BẢO MẬT — proxy chỉ chuyển tiếp khi:
//   1. Người gọi có phiên đăng nhập Supabase hợp lệ (kiểm tra token ở header Authorization).
//   2. Dùng token Facebook của chính người đó. Tài khoản cũ chưa có token riêng chỉ được dùng
//      FB_ACCESS_TOKEN của server nếu email nằm trong ALLOWED_EMAILS.
//   3. GET: chỉ đường dẫn dạng /v21.0/...  ·  POST: chỉ đổi trạng thái (status=ACTIVE|PAUSED) của một ID.
//
// Triển khai:
//   npx supabase secrets set FB_ACCESS_TOKEN=<token>                 (tùy chọn: token dự phòng cho tài khoản cũ)
//   npx supabase secrets set ALLOWED_EMAILS=email1@vidu.com          (tùy chọn: ai được dùng token dự phòng)
//   npx supabase functions deploy fb-proxy --no-verify-jwt
// (--no-verify-jwt để trình duyệt gửi được yêu cầu CORS "OPTIONS"; việc xác thực do code bên dưới tự làm.)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const GET_PATH = /^\/v\d+\.\d+\/[A-Za-z0-9_\/.%-]+(\?.*)?$/;
const POST_PATH = /^\/v\d+\.\d+\/\d+$/; // chỉ một ID số, không kèm tham số

// Xác thực người gọi bằng Supabase Auth; trả về { email, fbToken } hoặc null
async function verifiedUser(req: Request): Promise<{ email: string; fbToken: string } | null> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === "undefined" || jwt === "null") return null;
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const apikey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!sbUrl || !apikey) return null;
  try {
    const r = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { apikey, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    if (!user || typeof user.email !== "string") return null;
    const t = user.user_metadata && user.user_metadata.fb_token;
    return { email: user.email.trim().toLowerCase(), fbToken: typeof t === "string" ? t.trim() : "" };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") return fail(405, "Method không hỗ trợ");

  // 1. Phải đăng nhập
  const user = await verifiedUser(req);
  if (!user) return fail(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn, vui lòng đăng nhập lại");

  // 2. Token của chính tài khoản; tài khoản cũ trong ALLOWED_EMAILS được dùng token dự phòng của server
  const allowed = (Deno.env.get("ALLOWED_EMAILS") || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const fallback = allowed.includes(user.email) ? (Deno.env.get("FB_ACCESS_TOKEN") || "") : "";
  const token = user.fbToken || fallback;
  if (!token) return fail(403, "Tài khoản này chưa có Facebook Access Token. Hãy đăng ký tài khoản kèm token.");

  // 3. Chỉ cho phép đúng các yêu cầu dashboard cần
  const path = new URL(req.url).searchParams.get("path") || "";
  const u = new URL("https://graph.facebook.com" + (path.startsWith("/") ? path : "/"));
  u.searchParams.delete("access_token");

  const init: RequestInit = { method: req.method };
  if (req.method === "GET") {
    if (!GET_PATH.test(path)) return fail(400, "path không hợp lệ");
  } else {
    if (!POST_PATH.test(path)) return fail(400, "Chỉ được đổi trạng thái của một chiến dịch / nhóm QC / quảng cáo");
    const params = new URLSearchParams(await req.text());
    const keys = [...params.keys()];
    const status = params.get("status");
    if (keys.length !== 1 || keys[0] !== "status" || (status !== "ACTIVE" && status !== "PAUSED")) {
      return fail(400, "Chỉ cho phép status=ACTIVE hoặc status=PAUSED");
    }
    init.body = new URLSearchParams({ status }).toString();
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }
  u.searchParams.set("access_token", token);

  const r = await fetch(u, init);
  return new Response(await r.text(), {
    status: r.status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
