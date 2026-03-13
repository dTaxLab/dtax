# PricesApi

All URIs are relative to _http://localhost:3001_

| Method                                          | HTTP request                          | Description |
| ----------------------------------------------- | ------------------------------------- | ----------- |
| [**backfillPrices**](#backfillprices)           | **POST** /api/v1/prices/backfill      |             |
| [**getExchangeRates**](#getexchangerates)       | **GET** /api/v1/prices/exchange-rates |             |
| [**getHistoricalPrice**](#gethistoricalprice)   | **GET** /api/v1/prices/history        |             |
| [**getPrices**](#getprices)                     | **GET** /api/v1/prices                |             |
| [**getSupportedTickers**](#getsupportedtickers) | **GET** /api/v1/prices/supported      |             |

# **backfillPrices**

> BackfillPrices200Response backfillPrices(backfillPricesRequest)

Backfill missing USD values for user\'s transactions using historical prices

### Example

```typescript
import { PricesApi, Configuration, BackfillPricesRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new PricesApi(configuration);

let backfillPricesRequest: BackfillPricesRequest; //

const { status, data } = await apiInstance.backfillPrices(
  backfillPricesRequest,
);
```

### Parameters

| Name                      | Type                      | Description | Notes |
| ------------------------- | ------------------------- | ----------- | ----- |
| **backfillPricesRequest** | **BackfillPricesRequest** |             |       |

### Return type

**BackfillPrices200Response**

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

# **getExchangeRates**

> GetExchangeRates200Response getExchangeRates()

USD-relative exchange rates for supported fiat currencies

### Example

```typescript
import { PricesApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new PricesApi(configuration);

const { status, data } = await apiInstance.getExchangeRates();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**GetExchangeRates200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **502**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getHistoricalPrice**

> GetHistoricalPrice200Response getHistoricalPrice()

Fetch historical price for a single asset on a specific date

### Example

```typescript
import { PricesApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new PricesApi(configuration);

let asset: string; // (default to undefined)
let date: string; //Date in YYYY-MM-DD format (default to undefined)

const { status, data } = await apiInstance.getHistoricalPrice(asset, date);
```

### Parameters

| Name      | Type         | Description               | Notes                 |
| --------- | ------------ | ------------------------- | --------------------- |
| **asset** | [**string**] |                           | defaults to undefined |
| **date**  | [**string**] | Date in YYYY-MM-DD format | defaults to undefined |

### Return type

**GetHistoricalPrice200Response**

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
| **502**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getPrices**

> GetPrices200Response getPrices()

Fetch current USD prices for one or more assets

### Example

```typescript
import { PricesApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new PricesApi(configuration);

let assets: string; //Comma-separated asset tickers, e.g. BTC,ETH,SOL (default to undefined)

const { status, data } = await apiInstance.getPrices(assets);
```

### Parameters

| Name       | Type         | Description                                     | Notes                 |
| ---------- | ------------ | ----------------------------------------------- | --------------------- |
| **assets** | [**string**] | Comma-separated asset tickers, e.g. BTC,ETH,SOL | defaults to undefined |

### Return type

**GetPrices200Response**

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
| **502**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getSupportedTickers**

> GetSupportedTickers200Response getSupportedTickers()

List supported asset tickers

### Example

```typescript
import { PricesApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new PricesApi(configuration);

const { status, data } = await apiInstance.getSupportedTickers();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**GetSupportedTickers200Response**

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
