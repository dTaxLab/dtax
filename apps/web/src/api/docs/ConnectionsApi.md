# ConnectionsApi

All URIs are relative to _http://localhost:3001_

| Method                                    | HTTP request                           | Description |
| ----------------------------------------- | -------------------------------------- | ----------- |
| [**createConnection**](#createconnection) | **POST** /api/v1/connections           |             |
| [**deleteDataSource**](#deletedatasource) | **DELETE** /api/v1/data-sources/{id}   |             |
| [**listConnections**](#listconnections)   | **GET** /api/v1/connections            |             |
| [**listDataSources**](#listdatasources)   | **GET** /api/v1/data-sources           |             |
| [**renameDataSource**](#renamedatasource) | **PUT** /api/v1/data-sources/{id}      |             |
| [**syncConnection**](#syncconnection)     | **POST** /api/v1/connections/{id}/sync |             |

# **createConnection**

> CreateConnection201Response createConnection(connectionInput)

Setup a new exchange API connection

### Example

```typescript
import { ConnectionsApi, Configuration, ConnectionInput } from "./api";

const configuration = new Configuration();
const apiInstance = new ConnectionsApi(configuration);

let connectionInput: ConnectionInput; //

const { status, data } = await apiInstance.createConnection(connectionInput);
```

### Parameters

| Name                | Type                | Description | Notes |
| ------------------- | ------------------- | ----------- | ----- |
| **connectionInput** | **ConnectionInput** |             |       |

### Return type

**CreateConnection201Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **201**     | Default Response | -                |
| **400**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteDataSource**

> string deleteDataSource()

Delete a data source (unlinks transactions, does NOT delete them)

### Example

```typescript
import { ConnectionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new ConnectionsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.deleteDataSource(id);
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
| **204**     | Data source deleted | -                |
| **404**     | Default Response    | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listConnections**

> ListConnections200Response listConnections()

List all exchange API connections

### Example

```typescript
import { ConnectionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new ConnectionsApi(configuration);

const { status, data } = await apiInstance.listConnections();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**ListConnections200Response**

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

# **listDataSources**

> ListDataSources200Response listDataSources()

List all data sources (connections + CSV imports)

### Example

```typescript
import { ConnectionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new ConnectionsApi(configuration);

const { status, data } = await apiInstance.listDataSources();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**ListDataSources200Response**

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

# **renameDataSource**

> RenameDataSource200Response renameDataSource(renameDataSourceRequest)

Rename a data source

### Example

```typescript
import { ConnectionsApi, Configuration, RenameDataSourceRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new ConnectionsApi(configuration);

let id: string; // (default to undefined)
let renameDataSourceRequest: RenameDataSourceRequest; //

const { status, data } = await apiInstance.renameDataSource(
  id,
  renameDataSourceRequest,
);
```

### Parameters

| Name                        | Type                        | Description | Notes                 |
| --------------------------- | --------------------------- | ----------- | --------------------- |
| **renameDataSourceRequest** | **RenameDataSourceRequest** |             |                       |
| **id**                      | [**string**]                |             | defaults to undefined |

### Return type

**RenameDataSource200Response**

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

# **syncConnection**

> SyncConnection200Response syncConnection()

Trigger sync for a specific exchange connection

### Example

```typescript
import { ConnectionsApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new ConnectionsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.syncConnection(id);
```

### Parameters

| Name   | Type         | Description | Notes                 |
| ------ | ------------ | ----------- | --------------------- |
| **id** | [**string**] |             | defaults to undefined |

### Return type

**SyncConnection200Response**

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
