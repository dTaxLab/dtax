# AdminApi

All URIs are relative to _http://localhost:3001_

| Method                                | HTTP request                            | Description |
| ------------------------------------- | --------------------------------------- | ----------- |
| [**getAdminStats**](#getadminstats)   | **GET** /api/v1/admin/stats             |             |
| [**getAdminUser**](#getadminuser)     | **GET** /api/v1/admin/users/{id}        |             |
| [**listAdminUsers**](#listadminusers) | **GET** /api/v1/admin/users             |             |
| [**updateUserRole**](#updateuserrole) | **PATCH** /api/v1/admin/users/{id}/role |             |

# **getAdminStats**

> GetAdminStats200Response getAdminStats()

System overview statistics

### Example

```typescript
import { AdminApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AdminApi(configuration);

const { status, data } = await apiInstance.getAdminStats();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**GetAdminStats200Response**

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

# **getAdminUser**

> GetAdminUser200Response getAdminUser()

Get user details by ID

### Example

```typescript
import { AdminApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AdminApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.getAdminUser(id);
```

### Parameters

| Name   | Type         | Description | Notes                 |
| ------ | ------------ | ----------- | --------------------- |
| **id** | [**string**] |             | defaults to undefined |

### Return type

**GetAdminUser200Response**

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

# **listAdminUsers**

> ListAdminUsers200Response listAdminUsers()

List all users (paginated)

### Example

```typescript
import { AdminApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AdminApi(configuration);

let page: number; // (optional) (default to 1)
let limit: number; // (optional) (default to 20)

const { status, data } = await apiInstance.listAdminUsers(page, limit);
```

### Parameters

| Name      | Type         | Description | Notes                     |
| --------- | ------------ | ----------- | ------------------------- |
| **page**  | [**number**] |             | (optional) defaults to 1  |
| **limit** | [**number**] |             | (optional) defaults to 20 |

### Return type

**ListAdminUsers200Response**

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

# **updateUserRole**

> UpdateUserRole200Response updateUserRole(updateUserRoleRequest)

Change a user\'s role

### Example

```typescript
import { AdminApi, Configuration, UpdateUserRoleRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new AdminApi(configuration);

let id: string; // (default to undefined)
let updateUserRoleRequest: UpdateUserRoleRequest; //

const { status, data } = await apiInstance.updateUserRole(
  id,
  updateUserRoleRequest,
);
```

### Parameters

| Name                      | Type                      | Description | Notes                 |
| ------------------------- | ------------------------- | ----------- | --------------------- |
| **updateUserRoleRequest** | **UpdateUserRoleRequest** |             |                       |
| **id**                    | [**string**]              |             | defaults to undefined |

### Return type

**UpdateUserRole200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **400**     | Default Response | -                |
| **404**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
