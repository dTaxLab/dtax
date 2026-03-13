# BillingApi

All URIs are relative to _http://localhost:3001_

| Method                                              | HTTP request                      | Description |
| --------------------------------------------------- | --------------------------------- | ----------- |
| [**createBillingPortal**](#createbillingportal)     | **POST** /api/v1/billing/portal   |             |
| [**createCheckoutSession**](#createcheckoutsession) | **POST** /api/v1/billing/checkout |             |
| [**getBillingStatus**](#getbillingstatus)           | **GET** /api/v1/billing/status    |             |
| [**handleStripeWebhook**](#handlestripewebhook)     | **POST** /api/v1/billing/webhook  |             |

# **createBillingPortal**

> CreateBillingPortal200Response createBillingPortal()

Create a Stripe Customer Portal Session

### Example

```typescript
import { BillingApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new BillingApi(configuration);

const { status, data } = await apiInstance.createBillingPortal();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**CreateBillingPortal200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **400**     | Default Response | -                |
| **503**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createCheckoutSession**

> CreateCheckoutSession200Response createCheckoutSession(createCheckoutSessionRequest)

Create a Stripe Checkout Session for plan upgrade

### Example

```typescript
import { BillingApi, Configuration, CreateCheckoutSessionRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new BillingApi(configuration);

let createCheckoutSessionRequest: CreateCheckoutSessionRequest; //

const { status, data } = await apiInstance.createCheckoutSession(
  createCheckoutSessionRequest,
);
```

### Parameters

| Name                             | Type                             | Description | Notes |
| -------------------------------- | -------------------------------- | ----------- | ----- |
| **createCheckoutSessionRequest** | **CreateCheckoutSessionRequest** |             |       |

### Return type

**CreateCheckoutSession200Response**

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
| **500**     | Default Response | -                |
| **503**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getBillingStatus**

> GetBillingStatus200Response getBillingStatus()

Get current subscription status

### Example

```typescript
import { BillingApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new BillingApi(configuration);

const { status, data } = await apiInstance.getBillingStatus();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**GetBillingStatus200Response**

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

# **handleStripeWebhook**

> HandleStripeWebhook200Response handleStripeWebhook()

Stripe webhook handler (signature verification, no JWT auth)

### Example

```typescript
import { BillingApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new BillingApi(configuration);

const { status, data } = await apiInstance.handleStripeWebhook();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**HandleStripeWebhook200Response**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **400**     | Default Response | -                |
| **500**     | Default Response | -                |
| **503**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
