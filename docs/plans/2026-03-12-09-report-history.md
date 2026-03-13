# 报告历史与下载管理 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为用户提供历史税务报告的管理界面，支持重新下载已生成的 Form 8949 (CSV/PDF/TXF) 和 Schedule D，查看历史计算结果。

**Architecture:** 复用现有 `TaxReport` 模型（已有 reportData JSON 字段）。新增报告文件存储（本地文件系统或 S3）。API 提供报告列表和下载端点。前端在 Tax 页面添加 "Report History" 区域。

**Tech Stack:** Prisma (TaxReport), Fastify (stream download), Next.js

---

### Task 1: 扩展 TaxReport 模型

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

**Step 1: 添加报告文件相关字段**

```prisma
model TaxReport {
  // ... existing fields ...
  fileType     String?    // "csv" | "pdf" | "txf"
  fileName     String?    // 用户可见文件名
  fileSize     Int?       // 文件大小 (bytes)
  generatedAt  DateTime?  // 报告生成时间
}
```

**Step 2: Migration**

Run: `cd apps/api && npx prisma migrate dev --name add-report-file-fields`

**Step 3: Commit**

---

### Task 2: Report Storage Service

**Files:**

- Create: `apps/api/src/lib/report-storage.ts`
- Test: `apps/api/src/__tests__/report-storage.test.ts`

**Step 1: Write tests**

```typescript
describe("Report Storage", () => {
  it("should save report to disk and return path", async () => {
    const path = await saveReport(
      "user-1",
      "form8949-2024-FIFO",
      Buffer.from("test"),
      "csv",
    );
    expect(path).toContain("user-1");
    expect(path).toEndWith(".csv");
  });

  it("should retrieve saved report", async () => {
    const buffer = await getReport("user-1", "report-id");
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it("should delete old reports when limit exceeded", async () => {
    // 每个用户最多保留 50 个报告
  });
});
```

**Step 2: Implement**

```typescript
// apps/api/src/lib/report-storage.ts
import fs from "fs/promises";
import path from "path";

const REPORTS_DIR = process.env.REPORTS_DIR || "./data/reports";

export async function saveReport(
  userId: string,
  filename: string,
  content: Buffer,
  extension: string,
): Promise<string> {
  const dir = path.join(REPORTS_DIR, userId);
  await fs.mkdir(dir, { recursive: true });
  const filepath = path.join(dir, `${filename}.${extension}`);
  await fs.writeFile(filepath, content);
  return filepath;
}

export async function getReport(
  userId: string,
  filename: string,
): Promise<Buffer> {
  const filepath = path.join(REPORTS_DIR, userId, filename);
  return fs.readFile(filepath);
}

export async function deleteReport(
  userId: string,
  filename: string,
): Promise<void> {
  const filepath = path.join(REPORTS_DIR, userId, filename);
  await fs.unlink(filepath);
}
```

**Step 3: Commit**

---

### Task 3: 修改税务路由 — 保存报告记录

**Files:**

- Modify: `apps/api/src/routes/tax.ts`

在 Form 8949 CSV/PDF/TXF 生成端点中，生成后:

1. 保存文件到 report-storage
2. 更新/创建 TaxReport 记录（含 fileType, fileName, fileSize, generatedAt）

**Commit**

---

### Task 4: Report History API

**Files:**

- 在 `apps/api/src/routes/tax.ts` 中添加:

- `GET /tax/reports` — 列出用户的报告历史（分页，按 generatedAt 排序）
- `GET /tax/reports/:id/download` — 下载特定报告文件（stream response）
- `DELETE /tax/reports/:id` — 删除报告

**Commit**

---

### Task 5: Web UI — Report History

**Files:**

- Modify: `apps/web/src/app/[locale]/tax/page.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/messages/en.json` / `zh.json`

**Step 1: API 函数**

```typescript
export async function getReportHistory(page = 1, limit = 20) {
  /* ... */
}
export async function downloadReport(reportId: string) {
  /* ... */
}
export async function deleteReport(reportId: string) {
  /* ... */
}
```

**Step 2: 在 Tax 页面底部添加 "Report History" 表格**

| 报告类型      | 税年 | 方法 | 生成时间   | 文件大小 | 操作        |
| ------------- | ---- | ---- | ---------- | -------- | ----------- |
| Form 8949 PDF | 2024 | FIFO | 2025-03-10 | 245 KB   | 下载 / 删除 |

**Step 3: i18n**

```json
"reportHistory": {
  "title": "Report History",
  "noReports": "No reports generated yet",
  "type": "Report Type",
  "generatedAt": "Generated",
  "fileSize": "Size",
  "download": "Download",
  "delete": "Delete",
  "deleteConfirm": "Delete this report?"
}
```

**Step 4: Commit**

---

### Task 6: 五步法审计

- 报告文件存储目录权限正确（不可被 web 直接访问）
- 下载端点验证用户只能访问自己的报告
- 文件大小限制（防止超大报告耗尽磁盘）
- REPORTS_DIR 在 .gitignore 中
