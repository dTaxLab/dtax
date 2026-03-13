# SimulateSaleRequest

## Properties

| Name             | Type        | Description | Notes                                   |
| ---------------- | ----------- | ----------- | --------------------------------------- |
| **asset**        | **string**  |             | [default to undefined]                  |
| **amount**       | **number**  |             | [default to undefined]                  |
| **pricePerUnit** | **number**  |             | [default to undefined]                  |
| **method**       | **string**  |             | [optional] [default to MethodEnum_FIFO] |
| **strictSilo**   | **boolean** |             | [optional] [default to false]           |

## Example

```typescript
import { SimulateSaleRequest } from "./api";

const instance: SimulateSaleRequest = {
  asset,
  amount,
  pricePerUnit,
  method,
  strictSilo,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
