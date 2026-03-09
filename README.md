<p align="center">
  <h1 align="center">DTax</h1>
  <p align="center">
    <strong>AI-Powered Crypto Tax Intelligence Platform</strong>
  </p>
  <p align="center">
    <em>Tax clarity in a decentralized world | 链上税务，智能了然</em>
  </p>
  <p align="center">
    <a href="https://getdtax.com">Website</a> ·
    <a href="https://dtax.dev">Docs</a> ·
    <a href="#quick-start">Quick Start</a> ·
    <a href="#contributing">Contributing</a>
  </p>
</p>

---

## What is DTax?

DTax is an open-core crypto tax calculation and portfolio management platform. The core tax engine is fully open source (AGPL-3.0), allowing you to audit every calculation. The cloud platform at [getdtax.com](https://getdtax.com) offers additional AI-powered features, multi-chain tracking, and compliance reports.

### Why DTax?

- 🔓 **Open Source Tax Engine** — Audit every tax calculation. No black boxes.
- 🤖 **AI-Powered Classification** — Intelligent transaction categorization using LLMs
- 📊 **Portfolio Tracking** — Real-time holdings, P&L, and historical performance
- 💰 **Tax-Loss Harvesting** — AI identifies opportunities to reduce your tax bill
- 🌐 **Multi-Chain Support** — CEX APIs (100+ via CCXT) + on-chain data
- 📄 **Compliance Reports** — Form 8949, HMRC, and more
- 🖥️ **Self-Hostable** — Run the open source version on your own infrastructure

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   DTax Platform                      │
├──────────────┬──────────────┬───────────────────────┤
│  @dtax/web   │  @dtax/api   │     @dtax/cli        │
│  Next.js UI  │  Fastify API │  CLI Tool             │
├──────────────┴──────────────┴───────────────────────┤
│              @dtax/tax-engine (AGPL-3.0)            │
│              FIFO · LIFO · HIFO · Cost Basis        │
├─────────────────────────────────────────────────────┤
│              @dtax/shared-types                     │
│              TypeScript Type Definitions             │
└─────────────────────────────────────────────────────┘
```

## Project Structure

This is a **monorepo** managed by [Turborepo](https://turbo.build):

```
dtax/
├── apps/
│   ├── web/                # Next.js frontend (getdtax.com)
│   └── api/                # Fastify backend API
├── packages/
│   ├── tax-engine/         # 🔓 Core tax engine (AGPL-3.0, open source)
│   ├── cli/                # 🔓 CLI tool (AGPL-3.0, open source)
│   └── shared-types/       # 🔓 Shared TypeScript types (AGPL-3.0)
├── docs/                   # Documentation (dtax.dev)
└── docker/                 # Docker configurations
```

## Quick Start

### Option 1: CLI Tool (Open Source)

```bash
# Install the CLI
npm install -g @dtax/cli

# Import transactions from a CSV
dtax import --file trades.csv --exchange binance

# Calculate taxes using FIFO
dtax calculate --method fifo --year 2025

# Export results
dtax export --format csv --output tax-report.csv
```

### Option 2: Self-Hosted (Open Source)

```bash
# Clone the repository
git clone https://github.com/Phosmax/dtax.git
cd dtax

# Start with Docker
docker compose up -d

# Access the web UI at http://localhost:3000
```

### Option 3: Cloud Platform

Visit [getdtax.com](https://getdtax.com) for the full-featured cloud version with AI classification, multi-chain tracking, and compliance reports.

## Tech Stack

| Layer    | Technology               |
| -------- | ------------------------ |
| Language | TypeScript (full-stack)  |
| Frontend | Next.js 14 (App Router)  |
| Backend  | Node.js + Fastify        |
| Database | PostgreSQL               |
| Cache    | Redis                    |
| ORM      | Prisma                   |
| Queue    | BullMQ                   |
| AI       | OpenAI API (GPT-4o-mini) |
| Data     | CCXT (100+ exchanges)    |
| On-chain | Alchemy SDK / ethers.js  |
| Testing  | Vitest + Playwright      |

## Open Source vs Cloud

| Feature                          | Open Source (Free) | Cloud (Paid) |
| -------------------------------- | ------------------ | ------------ |
| Tax Calculation (FIFO/LIFO/HIFO) | ✅                 | ✅           |
| CLI Tool                         | ✅                 | ✅           |
| Basic Web UI                     | ✅                 | ✅           |
| CSV Import (10 exchanges)        | ✅                 | ✅           |
| AI Transaction Classification    | —                  | ✅           |
| Tax-Loss Harvesting              | —                  | ✅           |
| Multi-chain Tracking             | —                  | ✅           |
| Compliance Reports (Form 8949)   | —                  | ✅           |
| Enterprise Features              | —                  | ✅           |

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9, Docker

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Redis)
docker compose -f docker/docker-compose.dev.yml up -d

# Run database migrations
pnpm --filter @dtax/api db:migrate

# Start development servers
pnpm dev
```

## License

- **Core Engine** (`packages/tax-engine`, `packages/cli`, `packages/shared-types`): [AGPL-3.0](LICENSE)
- **Cloud Platform** (`apps/web`, `apps/api`): Proprietary — see [LICENSE-COMMERCIAL](LICENSE-COMMERCIAL)

## Links

- 🌐 Website: [getdtax.com](https://getdtax.com)
- 📚 Documentation: [dtax.dev](https://dtax.dev)
- 🐛 Issues: [GitHub Issues](https://github.com/Phosmax/dtax/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/Phosmax/dtax/discussions)
