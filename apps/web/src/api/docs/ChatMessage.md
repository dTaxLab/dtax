# ChatMessage

## Properties

| Name          | Type       | Description       | Notes                             |
| ------------- | ---------- | ----------------- | --------------------------------- |
| **id**        | **string** |                   | [default to undefined]            |
| **role**      | **string** | user or assistant | [default to undefined]            |
| **content**   | **string** |                   | [default to undefined]            |
| **createdAt** | **string** |                   | [default to undefined]            |
| **toolCalls** | **any**    |                   | [optional] [default to undefined] |

## Example

```typescript
import { ChatMessage } from "./api";

const instance: ChatMessage = {
  id,
  role,
  content,
  createdAt,
  toolCalls,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
