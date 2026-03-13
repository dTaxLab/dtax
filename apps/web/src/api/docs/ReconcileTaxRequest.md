# ReconcileTaxRequest

## Properties

| Name           | Type                                      | Description | Notes                             |
| -------------- | ----------------------------------------- | ----------- | --------------------------------- |
| **csvContent** | **string**                                |             | [default to undefined]            |
| **taxYear**    | **number**                                |             | [default to undefined]            |
| **brokerName** | **string**                                |             | [optional] [default to 'Unknown'] |
| **method**     | [**CostBasisMethod**](CostBasisMethod.md) |             | [optional] [default to undefined] |

## Example

```typescript
import { ReconcileTaxRequest } from "./api";

const instance: ReconcileTaxRequest = {
  csvContent,
  taxYear,
  brokerName,
  method,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
