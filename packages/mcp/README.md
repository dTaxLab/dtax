# @dtax/mcp

An [MCP](https://modelcontextprotocol.io) server that lets your AI assistant estimate crypto capital gains from the exchange and wallet CSV files on your computer. It uses the open-source [dTax](https://getdtax.com) calculation engine.

dTax MCP reads transaction files you choose, on your computer, and returns capital gains estimates. Results are for informational purposes only and are not tax advice. They depend on the file's completeness, the prices and cost basis available, and the stated country, tax year and method, and may be incomplete or incorrect. dTax is a calculation tool, not a tax advisory service. Confirm results with a qualified tax professional before relying on them or filing anything. Provided as is, without warranty.

## Status

Not yet published to npm (the package is marked private so that it is not published by accident). To use it now, build it from this repository:

```bash
pnpm install && pnpm --filter @dtax/mcp build
```

and point your assistant at `node /path/to/dtax/packages/mcp/dist/index.js`.

## Privacy

The server runs on your computer, makes no network calls, collects nothing, and writes nothing. dTax does not send data anywhere; your AI assistant may send results to its provider.

## What it can do

| Tool                     | What it returns                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `dtax_supported_formats` | The file formats, methods and countries available, and what is not handled                            |
| `dtax_read_file_summary` | Row counts, date range, rows by type, and the numbers of rows that could not be read                  |
| `dtax_estimate_gains`    | Estimated gains and losses for one tax year, the largest disposals, and what is missing from the data |
| `dtax_explain_disposal`  | The lots one disposal used, with their dates, cost and holding time                                   |

Every result starts with the notice above and says which country, tax year, method and engine version it comes from, and whether the data was complete.

Currently only the United States rules (FIFO, LIFO and HIFO) are available.

## What it does not do

- It does not pair transfers between your own wallets or accounts. Transfers in count as acquisitions and transfers out as disposals at the value in the file, so files with transfers are marked as not complete.
- It does not look up prices. A row without a USD value is counted as having none.
- It does not apply wash sale rules, state taxes or tax rates, and it does not give an amount of tax.
- It does not apply specific treatment to DeFi, NFTs, derivatives, staking or mining income, forks or gifts; rows of these types are flagged.

This list may be incomplete.

## Install (after publication)

Requires Node.js 20 or later. In Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dtax": {
      "command": "npx",
      "args": ["-y", "@dtax/mcp"]
    }
  }
}
```

Then ask your assistant, for example: "Read ~/Documents/coinbase.csv and estimate my 2025 gains with FIFO."

## Which files can be read

Only `.csv` files, up to 25 MB, inside your home folder or the folder the assistant was started in. Links are resolved before the check. To allow other folders, set `DTAX_MCP_ALLOWED_DIRS` to a list of folders separated by `:` (`;` on Windows); setting it replaces the default.

Text in a file is treated as data: a note or a coin name written as a sentence is never returned, and a row that cannot be read is reported only by its number.

## Wording

Results are estimates. The results and this package do not claim accuracy, approval by a tax authority, or readiness to file, and do not state what a person should report or pay.

## For software that needs prices, wallet pairing and reports

The dTax application at [getdtax.com](https://getdtax.com) connects exchanges and wallets, fills in prices and pairs transfers. It is a separate, paid product.

## License

AGPL-3.0. See [LICENSE](LICENSE).
