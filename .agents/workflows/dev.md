---
description: DTax 开发工作流 — 每次编程任务的标准流程，集成五步法审计
---

# DTax 开发工作流

> 每次编程任务（feature/fix/refactor）必须遵循此流程。
> 铁律：**Evidence Before Claims** — 先有证据，再下结论。

## 前置条件

- 已在 `/Users/ericw/project/dtax` 目录
- 所有依赖已安装 (`pnpm install`)
- 开发基础设施已启动 (PostgreSQL + Redis)

---

## Step 1: 准备 (Prepare)

1. 拉取最新代码

```bash
git checkout main && git pull origin main
```

2. 创建功能分支

```bash
git checkout -b <type>/<description>
# 例: feature/lifo-calculation, fix/csv-parse-error
# type: feature | fix | refactor | test | docs | chore
```

3. 明确任务范围
   - 这个任务改什么？不改什么？
   - 涉及哪些 packages？(tax-engine / cli / shared-types / web / api)
   - 有什么依赖前提？

---

## Step 2: 实现 (Implement)

1. 编写代码，遵循项目约定：
   - TypeScript strict mode
   - ESLint + Prettier 格式化
   - JSDoc 注释（尤其是 tax-engine 的计算逻辑）

2. 涉及税务计算时，必须：
   - 引用 IRS/HMRC 税务规则来源
   - 处理边界条件（零值、负值、部分消耗）
   - 文档说明公式

3. 编写对应测试：
   - tax-engine: 100% 覆盖率目标
   - api: 集成测试覆盖所有端点
   - web: 组件测试 + E2E 关键路径

---

## Step 3: 验证 (Verify) — 五步法审计

> **每次实现完成后，必须执行完整五步法。**

### 3.1 五层审计

按顺序逐层检查，每层必须给出 ✅ 或 ❌ 结论并附理由：

| 层  | 名称         | 检查什么                                                         |
| :-: | :----------- | :--------------------------------------------------------------- |
| 1️⃣  | **代码审计** | 代码逻辑是否正确实现了设计意图？调用链正确吗？边界条件处理了吗？ |
| 2️⃣  | **业务审计** | 业务层面结论是否站得住脚？结论有数据支撑吗？                     |
| 3️⃣  | **偏差审计** | 是否引入了系统性偏差？测试条件公平吗？                           |
| 4️⃣  | **历史对比** | 与之前结果是否一致/矛盾？变更是否引入了回归？                    |
| 5️⃣  | **路径依赖** | 是否引入了新的路径依赖或隐性前提？                               |

### 3.2 Verification 证据标准

运行以下命令，粘贴 fresh 输出作为证据：

// turbo

```bash
# 类型检查
pnpm exec tsc --noEmit
```

// turbo

```bash
# 单元测试
pnpm test
```

// turbo

```bash
# Lint 检查
pnpm lint
```

// turbo

```bash
# 构建验证
pnpm build
```

### 3.3 输出审计结果

```
## 五步法审计结果

✅/❌ 代码审计: [具体发现和证据]
✅/❌ 业务审计: [具体发现和证据]
✅/❌ 偏差审计: [具体发现和证据]
✅/❌ 历史对比: [具体发现和证据]
✅/❌ 路径依赖: [具体发现和证据]

## Verification 证据

- tsc --noEmit: [输出]
- pnpm test: [X passed, Y failed]
- pnpm lint: [输出]
- pnpm build: [输出]
- 结论: [基于以上证据的最终判断]
```

**禁止行为**:

- ❌ "should pass" — 不许用"应该通过"代替实际验证
- ❌ "looks correct" — 不许用"看起来对"代替运行确认
- ❌ 未运行命令就声称通过
- ❌ 引用旧的/缓存的输出作为证据

---

## Step 4: 提交 (Commit)

1. 使用 Conventional Commits 格式

```bash
git add -A
git commit -m "<type>(<scope>): <description>"
# 例: feat(tax-engine): add LIFO calculation method
# 例: fix(cli): handle empty CSV files gracefully
# 例: test(tax-engine): add edge cases for cross-year lots
```

2. 推送到对应仓库

```bash
# 推送到主仓库
git push origin <branch-name>

# 如果涉及 apps/web，同步到私有仓库
git subtree push --prefix=apps/web origin-web main

# 如果涉及 apps/api，同步到私有仓库
git subtree push --prefix=apps/api origin-api main
```

---

## Step 5: 收尾 (Wrap Up)

1. 合并到 main（如果是独立开发）

```bash
git checkout main
git merge <branch-name>
git push origin main
```

2. 更新记忆库（如有必要）
   - 架构变更 → 更新 `.memory/` 相关文档
   - 新增模块 → 更新 `PROJECT_BRIEF.md`

3. 清理

```bash
git branch -d <branch-name>
```

---

## 快速参考

### Git Remotes

| Remote       | URL                    | 用途         |
| ------------ | ---------------------- | ------------ |
| `origin`     | `dTaxLab/dtax.git`     | 主仓库       |
| `origin-web` | `dTaxLab/dtax-web.git` | 前端私有仓库 |
| `origin-api` | `dTaxLab/dtax-api.git` | 后端私有仓库 |

### Package 命令

| 命令                                  | 作用               |
| ------------------------------------- | ------------------ |
| `pnpm dev`                            | 启动所有开发服务器 |
| `pnpm build`                          | 构建所有包         |
| `pnpm test`                           | 运行所有测试       |
| `pnpm lint`                           | 检查代码规范       |
| `pnpm --filter @dtax/tax-engine test` | 仅运行税务引擎测试 |
