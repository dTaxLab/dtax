# CreateTransactionInput

## Properties

| Name                 | Type                    | Description | Notes                             |
| -------------------- | ----------------------- | ----------- | --------------------------------- |
| **type**             | [**TxType**](TxType.md) |             | [default to undefined]            |
| **timestamp**        | **string**              |             | [default to undefined]            |
| **sentAsset**        | **string**              |             | [optional] [default to undefined] |
| **sentAmount**       | **number**              |             | [optional] [default to undefined] |
| **sentValueUsd**     | **number**              |             | [optional] [default to undefined] |
| **receivedAsset**    | **string**              |             | [optional] [default to undefined] |
| **receivedAmount**   | **number**              |             | [optional] [default to undefined] |
| **receivedValueUsd** | **number**              |             | [optional] [default to undefined] |
| **feeAsset**         | **string**              |             | [optional] [default to undefined] |
| **feeAmount**        | **number**              |             | [optional] [default to undefined] |
| **feeValueUsd**      | **number**              |             | [optional] [default to undefined] |
| **notes**            | **string**              |             | [optional] [default to undefined] |
| **tags**             | **Array&lt;string&gt;** |             | [optional] [default to undefined] |
| **sourceId**         | **string**              |             | [optional] [default to undefined] |

## Example

```typescript
import { CreateTransactionInput } from "./api";

const instance: CreateTransactionInput = {
  type,
  timestamp,
  sentAsset,
  sentAmount,
  sentValueUsd,
  receivedAsset,
  receivedAmount,
  receivedValueUsd,
  feeAsset,
  feeAmount,
  feeValueUsd,
  notes,
  tags,
  sourceId,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
