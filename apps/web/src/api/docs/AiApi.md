# AiApi

All URIs are relative to _http://localhost:3001_

| Method                                                    | HTTP request                                             | Description |
| --------------------------------------------------------- | -------------------------------------------------------- | ----------- |
| [**aiClassifyAllUnknown**](#aiclassifyallunknown)         | **POST** /api/v1/transactions/ai-classify-all            |             |
| [**aiClassifyTransactions**](#aiclassifytransactions)     | **POST** /api/v1/transactions/ai-classify                |             |
| [**createConversation**](#createconversation)             | **POST** /api/v1/chat/conversations                      |             |
| [**deleteConversation**](#deleteconversation)             | **DELETE** /api/v1/chat/conversations/{id}               |             |
| [**getAiClassificationStats**](#getaiclassificationstats) | **GET** /api/v1/transactions/ai-stats                    |             |
| [**getConversation**](#getconversation)                   | **GET** /api/v1/chat/conversations/{id}                  |             |
| [**listConversations**](#listconversations)               | **GET** /api/v1/chat/conversations                       |             |
| [**sendChatMessage**](#sendchatmessage)                   | **POST** /api/v1/chat/conversations/{id}/messages        |             |
| [**streamChatMessage**](#streamchatmessage)               | **POST** /api/v1/chat/conversations/{id}/messages/stream |             |

# **aiClassifyAllUnknown**

> AiClassifyAllUnknown200Response aiClassifyAllUnknown()

Reclassify all UNKNOWN transactions using AI

### Example

```typescript
import { AiApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

const { status, data } = await apiInstance.aiClassifyAllUnknown();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**AiClassifyAllUnknown200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **503**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **aiClassifyTransactions**

> AiClassifyTransactions200Response aiClassifyTransactions(aiClassifyTransactionsRequest)

Classify specific transactions by ID using AI

### Example

```typescript
import { AiApi, Configuration, AiClassifyTransactionsRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

let aiClassifyTransactionsRequest: AiClassifyTransactionsRequest; //

const { status, data } = await apiInstance.aiClassifyTransactions(
  aiClassifyTransactionsRequest,
);
```

### Parameters

| Name                              | Type                              | Description | Notes |
| --------------------------------- | --------------------------------- | ----------- | ----- |
| **aiClassifyTransactionsRequest** | **AiClassifyTransactionsRequest** |             |       |

### Return type

**AiClassifyTransactions200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **503**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createConversation**

> CreateConversation200Response createConversation(createConversationRequest)

Create a new chat conversation

### Example

```typescript
import { AiApi, Configuration, CreateConversationRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

let createConversationRequest: CreateConversationRequest; //

const { status, data } = await apiInstance.createConversation(
  createConversationRequest,
);
```

### Parameters

| Name                          | Type                          | Description | Notes |
| ----------------------------- | ----------------------------- | ----------- | ----- |
| **createConversationRequest** | **CreateConversationRequest** |             |       |

### Return type

**CreateConversation200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteConversation**

> DeleteConversation200Response deleteConversation()

Delete a chat conversation

### Example

```typescript
import { AiApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.deleteConversation(id);
```

### Parameters

| Name   | Type         | Description | Notes                 |
| ------ | ------------ | ----------- | --------------------- |
| **id** | [**string**] |             | defaults to undefined |

### Return type

**DeleteConversation200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **404**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAiClassificationStats**

> GetAiClassificationStats200Response getAiClassificationStats()

Get AI classification statistics for current user

### Example

```typescript
import { AiApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

const { status, data } = await apiInstance.getAiClassificationStats();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**GetAiClassificationStats200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getConversation**

> GetConversation200Response getConversation()

Get a conversation with all its messages

### Example

```typescript
import { AiApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.getConversation(id);
```

### Parameters

| Name   | Type         | Description | Notes                 |
| ------ | ------------ | ----------- | --------------------- |
| **id** | [**string**] |             | defaults to undefined |

### Return type

**GetConversation200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **404**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listConversations**

> ListConversations200Response listConversations()

List user\'s chat conversations (paginated)

### Example

```typescript
import { AiApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

let page: number; // (optional) (default to 1)
let limit: number; // (optional) (default to 20)

const { status, data } = await apiInstance.listConversations(page, limit);
```

### Parameters

| Name      | Type         | Description | Notes                     |
| --------- | ------------ | ----------- | ------------------------- |
| **page**  | [**number**] |             | (optional) defaults to 1  |
| **limit** | [**number**] |             | (optional) defaults to 20 |

### Return type

**ListConversations200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **sendChatMessage**

> SendChatMessage200Response sendChatMessage(sendChatMessageRequest)

Send a message and get AI response

### Example

```typescript
import { AiApi, Configuration, SendChatMessageRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

let id: string; // (default to undefined)
let sendChatMessageRequest: SendChatMessageRequest; //

const { status, data } = await apiInstance.sendChatMessage(
  id,
  sendChatMessageRequest,
);
```

### Parameters

| Name                       | Type                       | Description | Notes                 |
| -------------------------- | -------------------------- | ----------- | --------------------- |
| **sendChatMessageRequest** | **SendChatMessageRequest** |             |                       |
| **id**                     | [**string**]               |             | defaults to undefined |

### Return type

**SendChatMessage200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **404**     | Default Response | -                |
| **429**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **streamChatMessage**

> StreamChatMessage200Response streamChatMessage(sendChatMessageRequest)

Send a message and get AI response via SSE stream

### Example

```typescript
import { AiApi, Configuration, SendChatMessageRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new AiApi(configuration);

let id: string; // (default to undefined)
let sendChatMessageRequest: SendChatMessageRequest; //

const { status, data } = await apiInstance.streamChatMessage(
  id,
  sendChatMessageRequest,
);
```

### Parameters

| Name                       | Type                       | Description | Notes                 |
| -------------------------- | -------------------------- | ----------- | --------------------- |
| **sendChatMessageRequest** | **SendChatMessageRequest** |             |                       |
| **id**                     | [**string**]               |             | defaults to undefined |

### Return type

**StreamChatMessage200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description               | Response headers |
| ----------- | ------------------------- | ---------------- |
| **200**     | Server-Sent Events stream | -                |
| **404**     | Default Response          | -                |
| **429**     | Default Response          | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
