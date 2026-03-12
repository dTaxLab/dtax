# DTax 仓库架构与商业模式指南

## 商业模式：Open Core

DTax 采用 **Open Core** 商业模式，核心算法开源（AGPL-3.0），Web 应用和 API 闭源收费。

```
┌─────────────────────────────────────────────┐
│              DTax 产品架构                     │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─── 开源层 (AGPL-3.0) ──────────────┐    │
│  │  packages/tax-engine   计算引擎      │    │
│  │  packages/shared-types 共享类型      │    │
│  │  packages/cli          命令行工具    │    │
│  │  docs/                 文档         │    │
│  └────────────────────────────────────┘    │
│                                             │
│  ┌─── 商业层 (LICENSE-COMMERCIAL) ────┐    │
│  │  apps/api    Fastify REST API       │    │
│  │  apps/web    Next.js 前端           │    │
│  │  docker/     部署配置               │    │
│  │  .github/    CI/CD 工作流           │    │
│  └────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

## 三个 GitHub 仓库

### 1. `dTaxLab/dtax` — 公开仓库 (PUBLIC)

**许可证：** AGPL-3.0
**内容：** 仅包含开源组件

```
dtax/
├── packages/
│   ├── tax-engine/    # 核心计算引擎 (FIFO/LIFO/HIFO/SpecificID, Form 8949, Schedule D, Wash Sale, 22个CSV解析器)
│   ├── shared-types/  # TypeScript 类型定义
│   └── cli/           # 命令行工具
├── docs/              # 项目文档
├── package.json       # 根配置
├── pnpm-workspace.yaml
├── tsconfig.json
├── turbo.json
├── LICENSE            # AGPL-3.0
└── README.md
```

**用途：**

- 开发者自建税务计算工具
- 社区贡献代码（解析器、算法）
- 学术研究和审计
- npm 包发布（@dtax/tax-engine, @dtax/shared-types, @dtax/cli）

**AGPL-3.0 的商业意义：**

- 任何使用此代码的衍生作品必须也开源
- 企业若想在闭源产品中集成 → 必须购买商业许可
- 这是"开源逼迫付费"策略，MongoDB、Grafana 等均采用类似模式

### 2. `dTaxLab/dtax-api` — 私有仓库 (PRIVATE)

**许可证：** LICENSE-COMMERCIAL（商业许可）
**内容：** 完整 monorepo 镜像

```
dtax-api/ (完整 monorepo)
├── apps/
│   ├── api/           # Fastify REST API (Prisma, JWT Auth, Stripe Billing, AI Chat)
│   └── web/           # Next.js 14 前端 (Dashboard, Tax Reports, Settings, Landing Page)
├── packages/          # 同公开仓库
├── docker/            # Docker 部署配置
├── .github/           # CI/CD 工作流
└── ...
```

**用途：** API 服务器开发和部署

### 3. `dTaxLab/dtax-web` — 私有仓库 (PRIVATE)

**许可证：** LICENSE-COMMERCIAL（商业许可）
**内容：** 与 dtax-api 相同的完整 monorepo 镜像

**用途：** 前端开发和部署（两个私有仓库便于独立设置 CI/CD 和访问权限）

## 三仓库关系图

```
本地 monorepo (/Users/ericw/project/dtax)
│
├──→ git push origin-api  ──→  dTaxLab/dtax-api (PRIVATE, 完整代码)
├──→ git push origin-web  ──→  dTaxLab/dtax-web (PRIVATE, 完整代码)
└──→ git-filter-repo      ──→  dTaxLab/dtax     (PUBLIC,  仅 packages/ + docs/)
     (克隆→过滤→force push)
```

**推送流程：**

1. 本地开发在完整 monorepo 中
2. `git push origin-api main` — 直接推送到私有 API 仓库
3. `git push origin-web main` — 直接推送到私有 Web 仓库
4. 公开仓库需要 `git-filter-repo` 过滤后 force push（移除 apps/、docker/ 等商业代码）

## 盈利模式

### 收入来源

| 渠道         | 目标用户             | 定价           | 说明                          |
| ------------ | -------------------- | -------------- | ----------------------------- |
| **B2C SaaS** | 个人交易者           | $49/税年 (PRO) | 一次性付费，不是订阅制        |
| **B2B SaaS** | 税务专业人士/CPA     | $199/席位/税年 | 多客户管理                    |
| **企业授权** | 使用 AGPL 代码的企业 | 议价           | AGPL 逼迫闭源企业购买商业许可 |
| **npm 包**   | 开发者生态           | 免费 (AGPL)    | 引流 + 品牌建设               |

### 免费层限制

| 功能           | FREE | PRO ($49)       | CPA ($199)      |
| -------------- | ---- | --------------- | --------------- |
| 交易笔数       | 50   | 无限            | 无限            |
| AI Chat 每日   | 5条  | 无限            | 无限            |
| Form 8949 导出 | CSV  | CSV + PDF + TXF | CSV + PDF + TXF |
| AI 交易分类    | 基础 | 全功能          | 全功能          |
| 多客户管理     | -    | -               | 支持            |

### 与竞品定价对比

| 产品            | 模式       | 个人用户价格 | 特色                    |
| --------------- | ---------- | ------------ | ----------------------- |
| **DTax**        | 一次性付费 | $49/税年     | 开源核心 + AI + 自托管  |
| **Koinly**      | 年费       | $49-$279/年  | 500K+用户，覆盖广       |
| **CoinTracker** | 年费       | $59-$199/年  | Coinbase 合作伙伴       |
| **Cryptact**    | 年费       | $45-$525/年  | 日本市场主导，34链 DeFi |
| **TurboTax**    | 年费       | $89+/年      | 通用报税，加密支持有限  |

**DTax 差异化优势：**

1. **AI-First**: Claude API 自动分类 + AI 税务助手（竞品均无）
2. **开源透明**: 算法可审计，AGPL 保证代码可见
3. **一次性付费**: 不是订阅制，长期成本更低
4. **自托管**: Docker 部署，数据完全自控
5. **IRS 深度合规**: Wash Sale + 1099-DA 对账 + Specific ID
