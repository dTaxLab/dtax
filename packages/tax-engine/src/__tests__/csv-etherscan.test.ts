/**
 * Tests for Etherscan CSV Parser
 * @license AGPL-3.0
 */

import { describe, it, expect } from 'vitest';
import {
    parseEtherscanCsv,
    parseEtherscanErc20Csv,
    isEtherscanCsv,
    isEtherscanErc20Csv,
    detectCsvFormat,
} from '../parsers';

const USER_ADDR = '0xabc123def456789012345678901234567890abcd';

// ─── Format Detection ─────────────────────────

describe('isEtherscanCsv', () => {
    it('should detect Etherscan normal transaction CSV', () => {
        const csv = '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","ContractAddress","Value_IN(ETH)","Value_OUT(ETH)","CurrentValue","TxnFee(ETH)","TxnFee(USD)","Historical $Price/Eth","Status","ErrCode"\n';
        expect(isEtherscanCsv(csv)).toBe(true);
    });

    it('should not detect Coinbase CSV as Etherscan', () => {
        const csv = 'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency\n';
        expect(isEtherscanCsv(csv)).toBe(false);
    });
});

describe('isEtherscanErc20Csv', () => {
    it('should detect Etherscan ERC-20 token transfer CSV', () => {
        const csv = '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","Value","TokenName","TokenSymbol","TokenDecimal"\n';
        expect(isEtherscanErc20Csv(csv)).toBe(true);
    });
});

describe('detectCsvFormat', () => {
    it('should detect etherscan format', () => {
        const csv = '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","ContractAddress","Value_IN(ETH)","Value_OUT(ETH)"\n';
        expect(detectCsvFormat(csv)).toBe('etherscan');
    });

    it('should detect etherscan_erc20 format', () => {
        const csv = '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","Value","TokenName","TokenSymbol","TokenDecimal"\n';
        expect(detectCsvFormat(csv)).toBe('etherscan_erc20');
    });
});

// ─── Normal Transaction Parsing ─────────────────────────

describe('parseEtherscanCsv', () => {
    function makeNormalCsv(rows: string[]): string {
        const header = '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","ContractAddress","Value_IN(ETH)","Value_OUT(ETH)","CurrentValue","TxnFee(ETH)","TxnFee(USD)","Historical $Price/Eth","Status","ErrCode"';
        return [header, ...rows].join('\n');
    }

    it('should parse incoming ETH transfer', () => {
        const csv = makeNormalCsv([
            '"0xaaa","12345","1704067200","2024-01-01 00:00:00","0xsender","0xabc123def456789012345678901234567890abcd","","1.5","0","","0.001","2.5","2500","","0"',
        ]);

        const result = parseEtherscanCsv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('TRANSFER_IN');
        expect(result.transactions[0].receivedAsset).toBe('ETH');
        expect(result.transactions[0].receivedAmount).toBe(1.5);
        expect(result.transactions[0].receivedValueUsd).toBe(3750); // 1.5 * 2500
    });

    it('should parse outgoing ETH transfer with gas fee', () => {
        const csv = makeNormalCsv([
            '"0xbbb","12346","1704153600","2024-01-02 00:00:00","0xabc123def456789012345678901234567890abcd","0xrecipient","","0","2.0","","0.002","5.0","2500","","0"',
        ]);

        const result = parseEtherscanCsv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('TRANSFER_OUT');
        expect(result.transactions[0].sentAsset).toBe('ETH');
        expect(result.transactions[0].sentAmount).toBe(2.0);
        expect(result.transactions[0].feeAsset).toBe('ETH');
        expect(result.transactions[0].feeAmount).toBe(0.002);
        expect(result.transactions[0].feeValueUsd).toBe(5.0);
    });

    it('should skip failed transactions', () => {
        const csv = makeNormalCsv([
            '"0xccc","12347","1704240000","2024-01-03","0xabc123def456789012345678901234567890abcd","0xrecipient","","0","1.0","","0.001","2.5","2500","0","Out of gas"',
        ]);

        const result = parseEtherscanCsv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(0);
    });

    it('should detect DEX swap via known router address', () => {
        // Uniswap V2 router
        const csv = makeNormalCsv([
            '"0xddd","12348","1704326400","2024-01-04","0xabc123def456789012345678901234567890abcd","0x7a250d5630b4cf539739df2c5dacb4c659f2488d","","0","0.5","","0.003","7.5","2500","","0"',
        ]);

        const result = parseEtherscanCsv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('DEX_SWAP');
    });

    it('should detect contract approval (zero value + gas)', () => {
        const csv = makeNormalCsv([
            '"0xeee","12349","1704412800","2024-01-05","0xabc123def456789012345678901234567890abcd","0xcontract","","0","0","","0.0005","1.25","2500","","0"',
        ]);

        const result = parseEtherscanCsv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('CONTRACT_APPROVAL');
        expect(result.transactions[0].feeAmount).toBe(0.0005);
    });

    it('should include txhash in notes', () => {
        const csv = makeNormalCsv([
            '"0xfff123","12350","1704499200","2024-01-06","0xsender","0xabc123def456789012345678901234567890abcd","","1.0","0","","0.001","2.5","2500","","0"',
        ]);

        const result = parseEtherscanCsv(csv, USER_ADDR);
        expect(result.transactions[0].notes).toBe('txhash:0xfff123');
    });

    it('should support custom native asset', () => {
        const csv = '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","ContractAddress","Value_IN(MATIC)","Value_OUT(MATIC)","CurrentValue","TxnFee(MATIC)","TxnFee(USD)","Historical $Price/Matic","Status","ErrCode"\n' +
            '"0xggg","12351","1704585600","2024-01-07","0xsender","0xabc123def456789012345678901234567890abcd","","100","0","","0.01","0.01","1.0","","0"';

        const result = parseEtherscanCsv(csv, USER_ADDR, 'MATIC');
        expect(result.transactions[0].receivedAsset).toBe('MATIC');
        expect(result.transactions[0].receivedAmount).toBe(100);
    });

    it('should handle multiple rows', () => {
        const csv = makeNormalCsv([
            '"0x1","1","1704067200","2024-01-01","0xsender","0xabc123def456789012345678901234567890abcd","","1.0","0","","0.001","2.5","2500","","0"',
            '"0x2","2","1704153600","2024-01-02","0xabc123def456789012345678901234567890abcd","0xrecip","","0","0.5","","0.001","2.5","2500","","0"',
        ]);

        const result = parseEtherscanCsv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(2);
        expect(result.summary.totalRows).toBe(2);
        expect(result.summary.parsed).toBe(2);
    });
});

// ─── ERC-20 Token Transfer Parsing ─────────────────────────

describe('parseEtherscanErc20Csv', () => {
    function makeErc20Csv(rows: string[]): string {
        const header = '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","Value","TokenName","TokenSymbol","TokenDecimal"';
        return [header, ...rows].join('\n');
    }

    it('should parse incoming ERC-20 transfer', () => {
        const csv = makeErc20Csv([
            '"0xaaa","12345","1704067200","2024-01-01","0xsender","0xabc123def456789012345678901234567890abcd","1000000000000000000","Wrapped Ether","WETH","18"',
        ]);

        const result = parseEtherscanErc20Csv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('TRANSFER_IN');
        expect(result.transactions[0].receivedAsset).toBe('WETH');
        expect(result.transactions[0].receivedAmount).toBe(1); // 1e18 / 1e18
    });

    it('should parse outgoing ERC-20 transfer', () => {
        const csv = makeErc20Csv([
            '"0xbbb","12346","1704153600","2024-01-02","0xabc123def456789012345678901234567890abcd","0xrecipient","500000000","USD Coin","USDC","6"',
        ]);

        const result = parseEtherscanErc20Csv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('TRANSFER_OUT');
        expect(result.transactions[0].sentAsset).toBe('USDC');
        expect(result.transactions[0].sentAmount).toBe(500); // 500e6 / 1e6
    });

    it('should handle different token decimals', () => {
        const csv = makeErc20Csv([
            '"0xccc","12347","1704240000","2024-01-03","0xsender","0xabc123def456789012345678901234567890abcd","100000000","Tether USD","USDT","6"',
        ]);

        const result = parseEtherscanErc20Csv(csv, USER_ADDR);
        expect(result.transactions[0].receivedAmount).toBe(100); // 1e8 / 1e6
    });

    it('should detect DEX swap from known router', () => {
        // Uniswap V3 router as sender
        const csv = makeErc20Csv([
            '"0xddd","12348","1704326400","2024-01-04","0xe592427a0aece92de3edee1f18e0157c05861564","0xabc123def456789012345678901234567890abcd","2000000000000000000","Wrapped Ether","WETH","18"',
        ]);

        const result = parseEtherscanErc20Csv(csv, USER_ADDR);
        expect(result.transactions[0].type).toBe('DEX_SWAP');
    });

    it('should skip rows with missing token info', () => {
        const csv = makeErc20Csv([
            '"0xeee","12349","1704412800","2024-01-05","0xsender","0xabc123def456789012345678901234567890abcd","","","","18"',
        ]);

        const result = parseEtherscanErc20Csv(csv, USER_ADDR);
        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
    });

    it('should include txhash in notes', () => {
        const csv = makeErc20Csv([
            '"0xfff456","12350","1704499200","2024-01-06","0xsender","0xabc123def456789012345678901234567890abcd","1000000000000000000","Dai Stablecoin","DAI","18"',
        ]);

        const result = parseEtherscanErc20Csv(csv, USER_ADDR);
        expect(result.transactions[0].notes).toBe('txhash:0xfff456');
    });
});
