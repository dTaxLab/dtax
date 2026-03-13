# HealthApi

All URIs are relative to _http://localhost:3001_

| Method                                  | HTTP request             | Description |
| --------------------------------------- | ------------------------ | ----------- |
| [**healthCheck**](#healthcheck)         | **GET** /api/health      |             |
| [**healthCheckDeep**](#healthcheckdeep) | **GET** /api/health/deep |             |

# **healthCheck**

> HealthStatus healthCheck()

Basic health check

### Example

```typescript
import { HealthApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new HealthApi(configuration);

const { status, data } = await apiInstance.healthCheck();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**HealthStatus**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **healthCheckDeep**

> DeepHealthStatus healthCheckDeep()

Deep health check including database connectivity

### Example

```typescript
import { HealthApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new HealthApi(configuration);

const { status, data } = await apiInstance.healthCheckDeep();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**DeepHealthStatus**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
