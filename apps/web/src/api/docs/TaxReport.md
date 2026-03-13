# TaxReport

## Properties

| Name                  | Type       | Description | Notes                             |
| --------------------- | ---------- | ----------- | --------------------------------- |
| **id**                | **string** |             | [default to undefined]            |
| **taxYear**           | **number** |             | [default to undefined]            |
| **method**            | **string** |             | [default to undefined]            |
| **shortTermGains**    | **number** |             | [default to undefined]            |
| **shortTermLosses**   | **number** |             | [default to undefined]            |
| **longTermGains**     | **number** |             | [default to undefined]            |
| **longTermLosses**    | **number** |             | [default to undefined]            |
| **netGainLoss**       | **number** |             | [default to undefined]            |
| **totalTransactions** | **number** |             | [default to undefined]            |
| **income**            | **any**    |             | [optional] [default to undefined] |

## Example

```typescript
import { TaxReport } from "./api";

const instance: TaxReport = {
  id,
  taxYear,
  method,
  shortTermGains,
  shortTermLosses,
  longTermGains,
  longTermLosses,
  netGainLoss,
  totalTransactions,
  income,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
