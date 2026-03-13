# TransactionsApi

All URIs are relative to _http://localhost:3001_

| Method                                                | HTTP request                             | Description |
| ----------------------------------------------------- | ---------------------------------------- | ----------- |
| [**bulkDeleteTransactions**](#bulkdeletetransactions) | **DELETE** /api/v1/transactions/bulk     |             |
| [**createTransaction**](#createtransaction)           | **POST** /api/v1/transactions            |             |
| [**deleteTransaction**](#deletetransaction)           | **DELETE** /api/v1/transactions/{id}     |             |
| [**exportTransactionsCsv**](#exporttransactionscsv)   | **GET** /api/v1/transactions/export      |             |
| [**exportTransactionsJson**](#exporttransactionsjson) | **GET** /api/v1/transactions/export-json |             |
| [**getTransaction**](#gettransaction)                 | **GET** /api/v1/transactions/{id}        |             |
| [**importTransactions**](#importtransactions)         | **POST** /api/v1/transactions/import     |             |
| [**listTransactions**](#listtransactions)             | **GET** /api/v1/transactions             |             |
| [**updateTransaction**](#updatetransaction)           | **PUT** /api/v1/transactions/{id}        |             |

# **bulkDeleteTransactions**

> BulkDeleteTransactions200Response bulkDeleteTransactions(bulkDeleteTransactionsRequest)

Bulk delete transactions by ID

### Example

```typescript
import {
  TransactionsApi,
  Configuration,
  BulkDeleteTransactionsRequest,
} from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

let bulkDeleteTransactionsRequest: BulkDeleteTransactionsRequest; //

const { status, data } = await apiInstance.bulkDeleteTransactions(
  bulkDeleteTransactionsRequest,
);
```

### Parameters

| Name                              | Type                              | Description | Notes |
| --------------------------------- | --------------------------------- | ----------- | ----- |
| **bulkDeleteTransactionsRequest** | **BulkDeleteTransactionsRequest** |             |       |

### Return type

**BulkDeleteTransactions200Response**

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

# **createTransaction**

> CreateTransaction201Response createTransaction(createTransactionInput)

Create a new transaction

### Example

```typescript
import { TransactionsApi, Configuration, CreateTransactionInput } from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

let createTransactionInput: CreateTransactionInput; //

const { status, data } = await apiInstance.createTransaction(
  createTransactionInput,
);
```

### Parameters

| Name                       | Type                       | Description | Notes |
| -------------------------- | -------------------------- | ----------- | ----- |
| **createTransactionInput** | **CreateTransactionInput** |             |       |

### Return type

**CreateTransaction201Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **201**     | Default Response | -                |
| **403**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteTransaction**

> string deleteTransaction()

Delete a single transaction

### Example

```typescript
import { TransactionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.deleteTransaction(id);
```

### Parameters

| Name   | Type         | Description | Notes                 |
| ------ | ------------ | ----------- | --------------------- |
| **id** | [**string**] |             | defaults to undefined |

### Return type

**string**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description         | Response headers |
| ----------- | ------------------- | ---------------- |
| **204**     | Transaction deleted | -                |
| **404**     | Default Response    | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **exportTransactionsCsv**

> any exportTransactionsCsv()

Export transactions as CSV file

### Example

```typescript
import { TransactionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

let from: string; // (optional) (default to undefined)
let to: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.exportTransactionsCsv(from, to);
```

### Parameters

| Name     | Type         | Description | Notes                            |
| -------- | ------------ | ----------- | -------------------------------- |
| **from** | [**string**] |             | (optional) defaults to undefined |
| **to**   | [**string**] |             | (optional) defaults to undefined |

### Return type

**any**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | CSV file content | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **exportTransactionsJson**

> any exportTransactionsJson()

Export all user data as JSON backup

### Example

```typescript
import { TransactionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

const { status, data } = await apiInstance.exportTransactionsJson();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**any**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | JSON backup file | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getTransaction**

> GetTransaction200Response getTransaction()

Get a single transaction by ID

### Example

```typescript
import { TransactionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.getTransaction(id);
```

### Parameters

| Name   | Type         | Description | Notes                 |
| ------ | ------------ | ----------- | --------------------- |
| **id** | [**string**] |             | defaults to undefined |

### Return type

**GetTransaction200Response**

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

# **importTransactions**

> ImportTransactions200Response importTransactions()

Upload CSV file, parse, and bulk insert transactions. Supports multiple exchange formats with auto-detection.

### Example

```typescript
import { TransactionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

let format: CsvFormat; // (optional) (default to undefined)
let source: string; //Custom data source name (optional) (default to undefined)
let userAddress: string; //User wallet address (for blockchain explorers) (optional) (default to undefined)
let nativeAsset: string; //Native asset symbol (for blockchain explorers) (optional) (default to undefined)

const { status, data } = await apiInstance.importTransactions(
  format,
  source,
  userAddress,
  nativeAsset,
);
```

### Parameters

| Name            | Type          | Description                                    | Notes                            |
| --------------- | ------------- | ---------------------------------------------- | -------------------------------- |
| **format**      | **CsvFormat** |                                                | (optional) defaults to undefined |
| **source**      | [**string**]  | Custom data source name                        | (optional) defaults to undefined |
| **userAddress** | [**string**]  | User wallet address (for blockchain explorers) | (optional) defaults to undefined |
| **nativeAsset** | [**string**]  | Native asset symbol (for blockchain explorers) | (optional) defaults to undefined |

### Return type

**ImportTransactions200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description                                    | Response headers |
| ----------- | ---------------------------------------------- | ---------------- |
| **200**     | Default Response                               | -                |
| **201**     | Default Response                               | -                |
| **400**     | Bad request (no transactions, invalid content) | -                |
| **403**     | Default Response                               | -                |
| **413**     | Default Response                               | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listTransactions**

> ListTransactions200Response listTransactions()

List transactions with pagination, filtering, and sorting

### Example

```typescript
import { TransactionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

let page: number; // (optional) (default to 1)
let limit: number; // (optional) (default to 20)
let asset: string; // (optional) (default to undefined)
let type: string; // (optional) (default to undefined)
let search: string; // (optional) (default to undefined)
let from: string; // (optional) (default to undefined)
let to: string; // (optional) (default to undefined)
let sort:
  | "timestamp"
  | "type"
  | "sentAmount"
  | "receivedAmount"
  | "sentValueUsd"
  | "receivedValueUsd"
  | "feeValueUsd"; // (optional) (default to 'timestamp')
let order: "asc" | "desc"; // (optional) (default to 'desc')

const { status, data } = await apiInstance.listTransactions(
  page,
  limit,
  asset,
  type,
  search,
  from,
  to,
  sort,
  order,
);
```

### Parameters

| Name       | Type                     | Description                                                                                 | Notes                            |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------- | ---------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------- |
| **page**   | [**number**]             |                                                                                             | (optional) defaults to 1         |
| **limit**  | [**number**]             |                                                                                             | (optional) defaults to 20        |
| **asset**  | [**string**]             |                                                                                             | (optional) defaults to undefined |
| **type**   | [**string**]             |                                                                                             | (optional) defaults to undefined |
| **search** | [**string**]             |                                                                                             | (optional) defaults to undefined |
| **from**   | [**string**]             |                                                                                             | (optional) defaults to undefined |
| **to**     | [**string**]             |                                                                                             | (optional) defaults to undefined |
| **sort**   | [\*\*&#39;timestamp&#39; | &#39;type&#39;                                                                              | &#39;sentAmount&#39;             | &#39;receivedAmount&#39;      | &#39;sentValueUsd&#39; | &#39;receivedValueUsd&#39; | &#39;feeValueUsd&#39;**]**Array<&#39;timestamp&#39; &#124; &#39;type&#39; &#124; &#39;sentAmount&#39; &#124; &#39;receivedAmount&#39; &#124; &#39;sentValueUsd&#39; &#124; &#39;receivedValueUsd&#39; &#124; &#39;feeValueUsd&#39; &#124; &#39;11184809&#39;>\*\* |     | (optional) defaults to 'timestamp' |
| **order**  | [\*\*&#39;asc&#39;       | &#39;desc&#39;**]**Array<&#39;asc&#39; &#124; &#39;desc&#39; &#124; &#39;11184809&#39;>\*\* |                                  | (optional) defaults to 'desc' |

### Return type

**ListTransactions200Response**

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

# **updateTransaction**

> GetTransaction200Response updateTransaction(updateTransactionRequest)

Update a transaction

### Example

```typescript
import {
  TransactionsApi,
  Configuration,
  UpdateTransactionRequest,
} from "./api";

const configuration = new Configuration();
const apiInstance = new TransactionsApi(configuration);

let id: string; // (default to undefined)
let updateTransactionRequest: UpdateTransactionRequest; //

const { status, data } = await apiInstance.updateTransaction(
  id,
  updateTransactionRequest,
);
```

### Parameters

| Name                         | Type                         | Description | Notes                 |
| ---------------------------- | ---------------------------- | ----------- | --------------------- |
| **updateTransactionRequest** | **UpdateTransactionRequest** |             |                       |
| **id**                       | [**string**]                 |             | defaults to undefined |

### Return type

**GetTransaction200Response**

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

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
