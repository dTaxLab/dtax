# TransfersApi

All URIs are relative to _http://localhost:3001_

| Method                                          | HTTP request                       | Description |
| ----------------------------------------------- | ---------------------------------- | ----------- |
| [**confirmTransfer**](#confirmtransfer)         | **POST** /api/v1/transfers/confirm |             |
| [**dismissTransfer**](#dismisstransfer)         | **POST** /api/v1/transfers/dismiss |             |
| [**listTransferMatches**](#listtransfermatches) | **GET** /api/v1/transfers/matches  |             |

# **confirmTransfer**

> ConfirmTransfer200Response confirmTransfer(transferPairInput)

Confirm a matched pair as internal transfer

### Example

```typescript
import { TransfersApi, Configuration, TransferPairInput } from "./api";

const configuration = new Configuration();
const apiInstance = new TransfersApi(configuration);

let transferPairInput: TransferPairInput; //

const { status, data } = await apiInstance.confirmTransfer(transferPairInput);
```

### Parameters

| Name                  | Type                  | Description | Notes |
| --------------------- | --------------------- | ----------- | ----- |
| **transferPairInput** | **TransferPairInput** |             |       |

### Return type

**ConfirmTransfer200Response**

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

# **dismissTransfer**

> DismissTransfer200Response dismissTransfer(transferPairInput)

Dismiss a matched pair (mark as reviewed)

### Example

```typescript
import { TransfersApi, Configuration, TransferPairInput } from "./api";

const configuration = new Configuration();
const apiInstance = new TransfersApi(configuration);

let transferPairInput: TransferPairInput; //

const { status, data } = await apiInstance.dismissTransfer(transferPairInput);
```

### Parameters

| Name                  | Type                  | Description | Notes |
| --------------------- | --------------------- | ----------- | ----- |
| **transferPairInput** | **TransferPairInput** |             |       |

### Return type

**DismissTransfer200Response**

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

# **listTransferMatches**

> ListTransferMatches200Response listTransferMatches()

Detect potential internal transfer pairs

### Example

```typescript
import { TransfersApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TransfersApi(configuration);

const { status, data } = await apiInstance.listTransferMatches();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**ListTransferMatches200Response**

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
