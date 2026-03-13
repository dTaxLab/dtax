# ImportResult

## Properties

| Name             | Type                 | Description | Notes                             |
| ---------------- | -------------------- | ----------- | --------------------------------- |
| **imported**     | **number**           |             | [default to undefined]            |
| **skipped**      | **number**           |             | [default to undefined]            |
| **aiClassified** | **number**           |             | [default to undefined]            |
| **sourceId**     | **string**           |             | [default to undefined]            |
| **sourceName**   | **string**           |             | [default to undefined]            |
| **errors**       | **Array&lt;any&gt;** |             | [optional] [default to undefined] |
| **summary**      | **any**              |             | [optional] [default to undefined] |

## Example

```typescript
import { ImportResult } from "./api";

const instance: ImportResult = {
  imported,
  skipped,
  aiClassified,
  sourceId,
  sourceName,
  errors,
  summary,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
