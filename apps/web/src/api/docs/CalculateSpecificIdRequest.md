# CalculateSpecificIdRequest

## Properties

| Name           | Type                                                                                                       | Description | Notes                         |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------- |
| **taxYear**    | **number**                                                                                                 |             | [default to undefined]        |
| **selections** | [**Array&lt;CalculateSpecificIdRequestSelectionsInner&gt;**](CalculateSpecificIdRequestSelectionsInner.md) |             | [default to undefined]        |
| **strictSilo** | **boolean**                                                                                                |             | [optional] [default to false] |

## Example

```typescript
import { CalculateSpecificIdRequest } from "./api";

const instance: CalculateSpecificIdRequest = {
  taxYear,
  selections,
  strictSilo,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
