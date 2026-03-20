export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // Only intercept root path
  if (url.pathname !== "/") {
    return next();
  }

  const acceptLanguage = request.headers.get("Accept-Language") || "";
  const locale = detectLocale(acceptLanguage);

  return Response.redirect(`${url.origin}/${locale}/`, 302);
}

function detectLocale(acceptLanguage) {
  if (!acceptLanguage) return "en";

  // Parse "zh-CN,zh;q=0.9,en;q=0.8" into sorted list
  const langs = acceptLanguage
    .split(",")
    .map((entry) => {
      const [code, q] = entry.trim().split(";q=");
      return { code: code.trim().toLowerCase(), q: parseFloat(q ?? "1") };
    })
    .sort((a, b) => b.q - a.q);

  for (const { code } of langs) {
    if (code.startsWith("zh")) return "zh-cn";
    if (code.startsWith("ja")) return "ja";
    if (code.startsWith("ko")) return "ko";
    if (code.startsWith("de")) return "de";
    if (code.startsWith("fr")) return "fr";
    if (code.startsWith("es")) return "es";
    if (code.startsWith("en")) return "en";
  }

  return "en";
}
