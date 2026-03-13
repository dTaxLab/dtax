# PortfolioApi

All URIs are relative to _http://localhost:3001_

| Method                                            | HTTP request                       | Description |
| ------------------------------------------------- | ---------------------------------- | ----------- |
| [**getPortfolioHoldings**](#getportfolioholdings) | **GET** /api/v1/portfolio/holdings |             |

# **getPortfolioHoldings**

> GetPortfolioHoldings200Response getPortfolioHoldings()

Aggregate holdings with optional tax-loss harvesting analysis

### Example

```typescript
import { PortfolioApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new PortfolioApi(configuration);

let prices: string; //JSON map of asset prices, e.g. {\"BTC\":45000} (optional) (default to undefined)

const { status, data } = await apiInstance.getPortfolioHoldings(prices);
```

### Parameters

| Name       | Type         | Description                                              | Notes                            |
| ---------- | ------------ | -------------------------------------------------------- | -------------------------------- |
| **prices** | [**string**] | JSON map of asset prices, e.g. {\&quot;BTC\&quot;:45000} | (optional) defaults to undefined |

### Return type

**GetPortfolioHoldings200Response**

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

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
