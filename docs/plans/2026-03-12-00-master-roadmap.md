# DTax 系统完善 — 总体路线图

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement each plan task-by-task.

**Goal:** 系统性补全 DTax 平台所有缺失功能，按优先级分批实施，每批完成后进行五步法审计。

## 五步法审计流程（每个计划完成后执行）

| 步骤                        | 内容                                              | 验证方法                                                      |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| **Step 1: 类型安全审计**    | 运行 `tsc --noEmit` 确保零类型错误                | `pnpm -r exec tsc --noEmit`                                   |
| **Step 2: 测试回归审计**    | 运行全量测试确保无回归                            | `pnpm test` (977+ tests 全过)                                 |
| **Step 3: 安全合规审计**    | 检查新代码无硬编码密钥、无 XSS/注入、输入验证完整 | 代码审查 + `grep -r "password\|secret\|key" --include="*.ts"` |
| **Step 4: i18n 完整性审计** | 新增 UI 文本必须有 EN/ZH 翻译                     | 对比 `messages/en.json` 和 `messages/zh.json` key 数量        |
| **Step 5: 构建部署审计**    | 确保 `pnpm build` 全部通过、Docker 构建正常       | `pnpm build` + `next build`                                   |

---

## 计划索引（按优先级）

### P0 — 核心商业价值 & 上线必需

| #   | 计划文件                 | 内容               | 预计任务数 |
| --- | ------------------------ | ------------------ | ---------- |
| 1   | `01-cpa-multi-client.md` | CPA 多客户管理系统 | 12 tasks   |
| 2   | `02-npm-publish.md`      | npm 包正式发布     | 6 tasks    |

### P1 — 安全合规 & 质量保障

| #   | 计划文件                        | 内容               | 预计任务数 |
| --- | ------------------------------- | ------------------ | ---------- |
| 3   | `03-2fa-totp.md`                | 两步验证（TOTP）   | 10 tasks   |
| 4   | `04-gdpr-data-export-delete.md` | 数据导出与账户删除 | 8 tasks    |
| 5   | `05-e2e-test-expansion.md`      | E2E 测试扩展       | 10 tasks   |

### P2 — 功能增强 & 竞争力

| #   | 计划文件                    | 内容               | 预计任务数 |
| --- | --------------------------- | ------------------ | ---------- |
| 6   | `06-notification-system.md` | 应用内通知系统     | 9 tasks    |
| 7   | `07-audit-log.md`           | 审计日志系统       | 7 tasks    |
| 8   | `08-defi-wallet-connect.md` | DeFi 钱包直连      | 11 tasks   |
| 9   | `09-report-history.md`      | 报告历史与下载管理 | 6 tasks    |
| 10  | `10-large-file-refactor.md` | 大文件拆分重构     | 8 tasks    |

### P3 — 增长 & 优化

| #   | 计划文件                   | 内容               | 预计任务数 |
| --- | -------------------------- | ------------------ | ---------- |
| 11  | `11-analytics-tracking.md` | 分析埋点 (PostHog) | 5 tasks    |
| 12  | `12-i18n-hardcode-fix.md`  | i18n 硬编码修复    | 3 tasks    |
| 13  | `13-api-caching.md`        | API 响应缓存       | 5 tasks    |
| 14  | `14-cli-test-expansion.md` | CLI 测试覆盖扩展   | 4 tasks    |

---

## 执行策略

1. **每个计划独立可交付** — 完成一个即可合并，不阻塞其他计划
2. **每个计划完成后运行五步法审计** — 确保质量门禁
3. **P0 串行优先** — CPA 多客户 → npm 发布
4. **P1 可并行** — 2FA、GDPR、E2E 互不依赖
5. **P2/P3 按资源灵活调度**

## 建议执行顺序

```
Week 1: Plan 12 (i18n fix, 快速胜利) → Plan 2 (npm publish)
Week 2: Plan 4 (GDPR) + Plan 5 (E2E tests) 并行
Week 3: Plan 3 (2FA)
Week 4: Plan 1 (CPA multi-client)
Week 5: Plan 7 (audit log) + Plan 9 (report history) 并行
Week 6: Plan 6 (notifications) + Plan 11 (analytics) 并行
Week 7: Plan 10 (refactor) + Plan 13 (caching) 并行
Week 8: Plan 8 (DeFi wallet) + Plan 14 (CLI tests)
```
