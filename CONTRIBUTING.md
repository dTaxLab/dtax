# Contributing to DTax

Thank you for your interest in contributing to DTax! 🎉

## Code of Conduct

Please be respectful and constructive in all interactions.

## What Can I Contribute?

### ✅ Open Source Components (AGPL-3.0)

These components welcome community contributions:

- **`packages/tax-engine/`** — Tax calculation logic (FIFO, LIFO, HIFO)
- **`packages/cli/`** — Command-line interface tool
- **`packages/shared-types/`** — Shared TypeScript type definitions

### 🔒 Proprietary Components

The following are not open for external contributions:

- `apps/web/` — Cloud platform frontend
- `apps/api/` — Cloud platform backend

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose
- Git

### Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/dtax.git
cd dtax

# 2. Install dependencies
pnpm install

# 3. Start dev infrastructure
docker compose -f docker/docker-compose.dev.yml up -d

# 4. Run tests to verify setup
pnpm test
```

## Development Workflow

### Branch Naming

```
feature/   — New feature (e.g., feature/lifo-calculation)
fix/       — Bug fix (e.g., fix/fifo-rounding-error)
docs/      — Documentation (e.g., docs/api-reference)
test/      — Tests (e.g., test/hifo-edge-cases)
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tax-engine): add LIFO calculation method
fix(cli): handle empty CSV files gracefully
docs(readme): update quick start guide
test(tax-engine): add edge cases for cross-year lots
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all tests pass: `pnpm test`
4. Ensure linting passes: `pnpm lint`
5. Submit a PR with a clear description

## Tax Engine Contribution Guide

When contributing to the tax engine, please:

1. **Write comprehensive tests** — Tax calculations must be verifiable
2. **Reference tax rules** — Link to IRS/HMRC documentation when implementing rules
3. **Handle edge cases** — Partial lots, cross-year holdings, zero-cost basis
4. **Document formulas** — Use JSDoc comments to explain calculation logic

### Example Test

```typescript
describe('FIFO Calculator', () => {
  it('should handle partial lot consumption', () => {
    const lots = [
      { asset: 'BTC', amount: 1.0, costBasis: 30000, date: '2024-01-01' },
    ];
    const sale = { asset: 'BTC', amount: 0.3, proceeds: 12000, date: '2025-06-01' };

    const result = calculateFIFO(lots, sale);

    expect(result.gainLoss).toBe(3000); // 12000 - (30000 * 0.3)
    expect(result.remainingLots[0].amount).toBe(0.7);
  });
});
```

## Contributor License Agreement (CLA)

By submitting a pull request, you agree that your contribution is licensed
under the AGPL-3.0 license, and you grant DTax the right to use your
contribution in both the open-source and commercial versions of the software.

## Need Help?

- 💬 [GitHub Discussions](https://github.com/Phosmax/dtax/discussions)
- 🐛 [Report a Bug](https://github.com/Phosmax/dtax/issues/new)
