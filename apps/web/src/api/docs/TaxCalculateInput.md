# TaxCalculateInput

## Properties

| Name           | Type                                      | Description | Notes                             |
| -------------- | ----------------------------------------- | ----------- | --------------------------------- |
| **taxYear**    | **number**                                |             | [default to undefined]            |
| **method**     | [**CostBasisMethod**](CostBasisMethod.md) |             | [optional] [default to undefined] |
| **strictSilo** | **boolean**                               |             | [optional] [default to false]     |

## Example

```typescript
import { TaxCalculateInput } from "./api";

const instance: TaxCalculateInput = {
  taxYear,
  method,
  strictSilo,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
