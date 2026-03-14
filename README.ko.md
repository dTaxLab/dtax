<p align="center">
  <img src="apps/web/public/logo-512.png" alt="dTax" width="120" height="120">
  <h1 align="center">dTax</h1>
  <p align="center">
    <strong>npm에서 유일한 완전한 TypeScript 암호화폐 세금 엔진</strong>
  </p>
  <p align="center">
    <a href="https://github.com/dTaxLab/dtax/actions/workflows/ci.yml"><img src="https://github.com/dTaxLab/dtax/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License"></a>
    <a href="https://www.npmjs.com/package/@dtax/tax-engine"><img src="https://img.shields.io/npm/v/@dtax/tax-engine" alt="npm"></a>
    <a href="https://github.com/dTaxLab/dtax"><img src="https://img.shields.io/github/stars/dTaxLab/dtax?style=social" alt="Stars"></a>
  </p>
  <p align="center">
    <a href="README.md">English</a> · <a href="README.zh.md">简体中文</a> · <a href="README.zh-Hant.md">繁體中文</a> · <a href="README.es.md">Español</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt.md">Português</a>
  </p>
</p>

---

**23개 거래소 파서** | **FIFO / LIFO / HIFO / Specific ID** | **Form 8949 + Schedule D** | **워시세일 감지** | **가상 매도 시뮬레이터**

## 설치

```bash
npm install @dtax/tax-engine
```

## 빠른 예제

```typescript
import {
  parseCsv,
  CostBasisCalculator,
  generateForm8949,
} from "@dtax/tax-engine";

// 1. 거래소 CSV 파싱 (형식 자동 감지)
const { lots, events } = parseCsv(csvString);

// 2. 자본이득/손실 계산
const calc = new CostBasisCalculator("FIFO");
calc.addLots(lots);
const results = events.map((e) => calc.calculate(e));

// 3. IRS Form 8949 생성
const report = generateForm8949(results);
```

## CLI

코드 작성 없이 커맨드 라인에서 세금을 계산하세요:

```bash
npx @dtax/cli calculate trades.csv --method FIFO
npx @dtax/cli calculate trades.csv --method LIFO --year 2025 --json
npx @dtax/cli calculate coinbase.csv binance.csv --method HIFO
```

반복 사용을 위해 전역 설치:

```bash
npm install -g @dtax/cli
dtax calculate trades.csv --method FIFO --form8949 report.csv
dtax calculate trades.csv --schedule-d --include-wash-sales
```

## 지원 거래소 (23개 파서)

모든 파서가 CSV 형식을 자동 감지합니다. 별도의 설정이 필요 없습니다.

| 분류         | 거래소                                                                              |
| ------------ | ----------------------------------------------------------------------------------- |
| 주요         | Coinbase, Binance, Binance US, Kraken, Gemini                                       |
| 글로벌       | KuCoin, OKX, Bybit, Gate.io, Bitget, MEXC, HTX (Huobi)                              |
| 기타         | Crypto.com, Bitfinex, Poloniex                                                      |
| 온체인       | Etherscan (ETH + ERC-20 + BSC/Polygon/Avalanche/Fantom), Solscan (SOL + SPL + DeFi) |
| 마이그레이션 | Koinly, CoinTracker, Cryptact (경쟁사에서 가져오기)                                 |
| 대체         | Generic CSV (직접 열 매핑)                                                          |

## 주요 기능

- **4가지 원가 기준 방식** -- FIFO, LIFO, HIFO, Specific ID (IRS 규정 준수)
- **Form 8949** -- CSV, PDF, TXF (TurboTax) 내보내기 및 Box A-F 분류
- **Schedule D** -- Part I/II 합산, $3,000 손실 한도, 이월 계산
- **워시세일 감지** -- 30일 기간, 부분 비허용, Form 8949 코드 W
- **가상 매도 시뮬레이터** -- 매도 전 세금 영향 미리보기 (`simulateSale()`)
- **방식 비교** -- FIFO/LIFO/HIFO 중 최적 방식 찾기 (`compareAllMethods()`)
- **DeFi + NFT 지원** -- LP 예치/출금, 스테이킹, 랩핑, 브릿지, 12개 DeFi 거래 유형
- **1099-DA 대사** -- 브로커 보고 데이터와 3단계 매칭
- **포트폴리오 분석** -- 보유 자산 합산, 미실현 손익, 세금 손실 수확 기회
- **지갑별 분리 회계** -- 지갑별 엄격한 원가 기준 분리
- **내부 이체 매칭** -- 본인 소유 지갑 간 이체 자동 감지

## 대안과의 비교

| 기능                  |    dTax    |  Rotki  |   RP2    |
| --------------------- | :--------: | :-----: | :------: |
| 언어                  | TypeScript | Python  |  Python  |
| npm 설치 가능         |    Yes     |   No    |    No    |
| 거래소 파서           |     23     |   15    |    8     |
| 원가 기준 방식        |     4      |    3    |    3     |
| Form 8949 PDF         |    Yes     |   No    |    No    |
| TurboTax TXF 내보내기 |    Yes     |   No    |    No    |
| Schedule D 생성       |    Yes     |   No    |    No    |
| 워시세일 감지         |    Yes     |   Yes   |    No    |
| 가상 매도 시뮬레이터  |    Yes     |   No    |    No    |
| 방식 비교             |    Yes     |   No    |    No    |
| DeFi/NFT 거래 유형    |     12     |    8    |    4     |
| 1099-DA 대사          |    Yes     |   No    |    No    |
| 경쟁사 CSV 가져오기   |    Yes     |   No    |    No    |
| CLI 도구              |    Yes     |   Yes   |   Yes    |
| 브라우저/Node.js      |    Both    | Desktop | CLI only |

## 패키지

| 패키지                                        | 설명                         |
| --------------------------------------------- | ---------------------------- |
| [`@dtax/tax-engine`](packages/tax-engine)     | 핵심 계산 엔진, 파서, 보고서 |
| [`@dtax/cli`](packages/cli)                   | 커맨드 라인 인터페이스       |
| [`@dtax/shared-types`](packages/shared-types) | TypeScript 타입 정의         |

## API 하이라이트

```typescript
// 원가 기준 계산
import { calculateFIFO, calculateLIFO, calculateHIFO } from "@dtax/tax-engine";

// 보고서
import {
  generateForm8949,
  form8949ToCsv,
  generateForm8949Pdf,
} from "@dtax/tax-engine";
import { generateScheduleD } from "@dtax/tax-engine";
import { form8949ToTxf } from "@dtax/tax-engine"; // TurboTax

// 분석
import { detectWashSales } from "@dtax/tax-engine";
import { simulateSale } from "@dtax/tax-engine"; // 가상 매도
import { compareAllMethods } from "@dtax/tax-engine"; // 최적화
import { analyzeHoldings } from "@dtax/tax-engine"; // 포트폴리오

// 파서 (자동 감지 또는 개별 사용)
import { parseCsv, detectCsvFormat } from "@dtax/tax-engine";
```

## 기여하기

기여를 환영합니다. 가이드라인은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

```bash
# 필수 조건: Node.js >= 20, pnpm >= 9
git clone https://github.com/dTaxLab/dtax.git && cd dtax
pnpm install
pnpm test        # 모든 패키지에 걸쳐 800개 이상의 테스트
pnpm build       # 모든 패키지 빌드
```

## 라이선스

이 저장소의 모든 패키지는 [AGPL-3.0](LICENSE) 라이선스를 따릅니다.

dTax를 프로젝트에서 자유롭게 사용할 수 있습니다. 소스를 수정하여 배포하는 경우 (네트워크 서비스 포함), 수정 사항을 AGPL-3.0으로 공개해야 합니다.

상업용 라이선스 문의: [getdtax.com](https://getdtax.com)

## 링크

- 웹사이트: [getdtax.com](https://getdtax.com)
- 이슈: [GitHub Issues](https://github.com/dTaxLab/dtax/issues)
- 토론: [GitHub Discussions](https://github.com/dTaxLab/dtax/discussions)
