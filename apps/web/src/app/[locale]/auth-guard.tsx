"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "next-intl";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const tc = useTranslations("common");

  // auth 页面和首页不需要守卫
  const segments = pathname.split("/").filter(Boolean);
  if (pathname.endsWith("/auth") || segments.length <= 1) {
    return <>{children}</>;
  }

  // 加载中显示 loading
  if (loading) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="loading-pulse" style={{ fontSize: "48px" }}>
          🧮
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "16px" }}>
          {tc("loading")}
        </p>
      </div>
    );
  }

  // 未登录重定向到 auth 页面
  if (!user) {
    // 使用 dynamic import 避免循环依赖
    const AuthPage = require("./auth/page").default;
    return <AuthPage />;
  }

  return <>{children}</>;
}
