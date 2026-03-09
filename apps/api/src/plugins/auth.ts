/**
 * 认证插件
 * 注册 @fastify/jwt，为每个请求装饰 userId 和 userRole。
 * 公共路由（健康检查、注册、登录）跳过认证。
 */

import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config";

// 扩展 Fastify 类型声明
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userRole: string;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: string };
    user: { sub: string; role: string };
  }
}

async function authPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: "7d" },
  });

  // 装饰请求对象
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");

  // 认证钩子 — 跳过公共路由
  app.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const url = request.url;

      // 公共路由无需认证
      if (
        url.startsWith("/api/health") ||
        url.startsWith("/api/v1/auth/register") ||
        url.startsWith("/api/v1/auth/login")
      ) {
        return;
      }

      try {
        const decoded = (await request.jwtVerify()) as {
          sub: string;
          role: string;
        };
        request.userId = decoded.sub;
        request.userRole = decoded.role;
      } catch {
        return reply.status(401).send({
          error: { code: "UNAUTHORIZED", message: "Invalid or missing token" },
        });
      }
    },
  );
}

export default fp(authPlugin, { name: "auth" });
