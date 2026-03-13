# ErrorResponseError

## Properties

| Name        | Type                                                                                 | Description | Notes                             |
| ----------- | ------------------------------------------------------------------------------------ | ----------- | --------------------------------- |
| **message** | **string**                                                                           |             | [default to undefined]            |
| **code**    | **string**                                                                           |             | [optional] [default to undefined] |
| **details** | [**Array&lt;ErrorResponseErrorDetailsInner&gt;**](ErrorResponseErrorDetailsInner.md) |             | [optional] [default to undefined] |

## Example

```typescript
import { ErrorResponseError } from "./api";

const instance: ErrorResponseError = {
  message,
  code,
  details,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
