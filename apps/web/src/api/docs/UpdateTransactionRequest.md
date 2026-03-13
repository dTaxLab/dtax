# UpdateTransactionRequest

## Properties

| Name                 | Type                    | Description | Notes                             |
| -------------------- | ----------------------- | ----------- | --------------------------------- |
| **type**             | [**TxType**](TxType.md) |             | [optional] [default to undefined] |
| **timestamp**        | **string**              |             | [optional] [default to undefined] |
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
import { UpdateTransactionRequest } from "./api";

const instance: UpdateTransactionRequest = {
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
