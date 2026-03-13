# TaxApi

All URIs are relative to _http://localhost:3001_

| Method                                          | HTTP request                            | Description |
| ----------------------------------------------- | --------------------------------------- | ----------- |
| [**calculateSpecificId**](#calculatespecificid) | **POST** /api/v1/tax/calculate-specific |             |
| [**calculateTax**](#calculatetax)               | **POST** /api/v1/tax/calculate          |             |
| [**compareMethods**](#comparemethods)           | **POST** /api/v1/tax/compare-methods    |             |
| [**getAvailableLots**](#getavailablelots)       | **GET** /api/v1/tax/available-lots      |             |
| [**getForm8949**](#getform8949)                 | **GET** /api/v1/tax/form8949            |             |
| [**getScheduleD**](#getscheduled)               | **GET** /api/v1/tax/schedule-d          |             |
| [**getTaxSummary**](#gettaxsummary)             | **GET** /api/v1/tax/summary             |             |
| [**reconcileTax**](#reconciletax)               | **POST** /api/v1/tax/reconcile          |             |
| [**runRiskScan**](#runriskscan)                 | **POST** /api/v1/tax/risk-scan          |             |
| [**simulateSale**](#simulatesale)               | **POST** /api/v1/tax/simulate           |             |

# **calculateSpecificId**

> CalculateSpecificId200Response calculateSpecificId(calculateSpecificIdRequest)

Calculate tax using user-selected lots (Specific ID method)

### Example

```typescript
import { TaxApi, Configuration, CalculateSpecificIdRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let calculateSpecificIdRequest: CalculateSpecificIdRequest; //

const { status, data } = await apiInstance.calculateSpecificId(
  calculateSpecificIdRequest,
);
```

### Parameters

| Name                           | Type                           | Description | Notes |
| ------------------------------ | ------------------------------ | ----------- | ----- |
| **calculateSpecificIdRequest** | **CalculateSpecificIdRequest** |             |       |

### Return type

**CalculateSpecificId200Response**

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

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **calculateTax**

> CalculateTax200Response calculateTax(taxCalculateInput)

Run tax calculation for a given year and cost basis method

### Example

```typescript
import { TaxApi, Configuration, TaxCalculateInput } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let taxCalculateInput: TaxCalculateInput; //

const { status, data } = await apiInstance.calculateTax(taxCalculateInput);
```

### Parameters

| Name                  | Type                  | Description | Notes |
| --------------------- | --------------------- | ----------- | ----- |
| **taxCalculateInput** | **TaxCalculateInput** |             |       |

### Return type

**CalculateTax200Response**

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

# **compareMethods**

> GetScheduleD200Response compareMethods(compareMethodsRequest)

Compare tax impact across all cost basis methods (FIFO, LIFO, HIFO)

### Example

```typescript
import { TaxApi, Configuration, CompareMethodsRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let compareMethodsRequest: CompareMethodsRequest; //

const { status, data } = await apiInstance.compareMethods(
  compareMethodsRequest,
);
```

### Parameters

| Name                      | Type                      | Description | Notes |
| ------------------------- | ------------------------- | ----------- | ----- |
| **compareMethodsRequest** | **CompareMethodsRequest** |             |       |

### Return type

**GetScheduleD200Response**

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

# **getAvailableLots**

> GetAvailableLots200Response getAvailableLots()

List available tax lots for Specific ID cost basis method selection

### Example

```typescript
import { TaxApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let year: number; // (default to undefined)
let asset: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.getAvailableLots(year, asset);
```

### Parameters

| Name      | Type         | Description | Notes                            |
| --------- | ------------ | ----------- | -------------------------------- |
| **year**  | [**number**] |             | defaults to undefined            |
| **asset** | [**string**] |             | (optional) defaults to undefined |

### Return type

**GetAvailableLots200Response**

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

# **getForm8949**

> any getForm8949()

Generate Form 8949 report in JSON, CSV, PDF, or TXF format

### Example

```typescript
import { TaxApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let year: number; // (default to undefined)
let method: CostBasisMethod; // (optional) (default to undefined)
let format: Form8949Format; // (optional) (default to undefined)
let strictSilo: boolean; // (optional) (default to false)
let includeWashSales: boolean; // (optional) (default to false)

const { status, data } = await apiInstance.getForm8949(
  year,
  method,
  format,
  strictSilo,
  includeWashSales,
);
```

### Parameters

| Name                 | Type                | Description | Notes                            |
| -------------------- | ------------------- | ----------- | -------------------------------- |
| **year**             | [**number**]        |             | defaults to undefined            |
| **method**           | **CostBasisMethod** |             | (optional) defaults to undefined |
| **format**           | **Form8949Format**  |             | (optional) defaults to undefined |
| **strictSilo**       | [**boolean**]       |             | (optional) defaults to false     |
| **includeWashSales** | [**boolean**]       |             | (optional) defaults to false     |

### Return type

**any**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description                                          | Response headers |
| ----------- | ---------------------------------------------------- | ---------------- |
| **200**     | Form 8949 report (format depends on query parameter) | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getScheduleD**

> GetScheduleD200Response getScheduleD()

Generate Schedule D summary from Form 8949 data

### Example

```typescript
import { TaxApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let year: number; // (default to undefined)
let method: CostBasisMethod; // (optional) (default to undefined)
let strictSilo: boolean; // (optional) (default to false)
let includeWashSales: boolean; // (optional) (default to false)
let lossLimit: number; // (optional) (default to 3000)

const { status, data } = await apiInstance.getScheduleD(
  year,
  method,
  strictSilo,
  includeWashSales,
  lossLimit,
);
```

### Parameters

| Name                 | Type                | Description | Notes                            |
| -------------------- | ------------------- | ----------- | -------------------------------- |
| **year**             | [**number**]        |             | defaults to undefined            |
| **method**           | **CostBasisMethod** |             | (optional) defaults to undefined |
| **strictSilo**       | [**boolean**]       |             | (optional) defaults to false     |
| **includeWashSales** | [**boolean**]       |             | (optional) defaults to false     |
| **lossLimit**        | [**number**]        |             | (optional) defaults to 3000      |

### Return type

**GetScheduleD200Response**

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

# **getTaxSummary**

> GetTaxSummary200Response getTaxSummary()

Get saved tax calculation summary for a year and method

### Example

```typescript
import { TaxApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let year: number; // (default to undefined)
let method: CostBasisMethod; // (optional) (default to undefined)

const { status, data } = await apiInstance.getTaxSummary(year, method);
```

### Parameters

| Name       | Type                | Description | Notes                            |
| ---------- | ------------------- | ----------- | -------------------------------- |
| **year**   | [**number**]        |             | defaults to undefined            |
| **method** | **CostBasisMethod** |             | (optional) defaults to undefined |

### Return type

**GetTaxSummary200Response**

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

# **reconcileTax**

> GetScheduleD200Response reconcileTax(reconcileTaxRequest)

Upload 1099-DA CSV and reconcile against DTax calculations

### Example

```typescript
import { TaxApi, Configuration, ReconcileTaxRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let reconcileTaxRequest: ReconcileTaxRequest; //

const { status, data } = await apiInstance.reconcileTax(reconcileTaxRequest);
```

### Parameters

| Name                    | Type                    | Description | Notes |
| ----------------------- | ----------------------- | ----------- | ----- |
| **reconcileTaxRequest** | **ReconcileTaxRequest** |             |       |

### Return type

**GetScheduleD200Response**

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

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **runRiskScan**

> RunRiskScan200Response runRiskScan(runRiskScanRequest)

Run pre-audit risk scan for a tax year

### Example

```typescript
import { TaxApi, Configuration, RunRiskScanRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let runRiskScanRequest: RunRiskScanRequest; //

const { status, data } = await apiInstance.runRiskScan(runRiskScanRequest);
```

### Parameters

| Name                   | Type                   | Description | Notes |
| ---------------------- | ---------------------- | ----------- | ----- |
| **runRiskScanRequest** | **RunRiskScanRequest** |             |       |

### Return type

**RunRiskScan200Response**

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

# **simulateSale**

> GetScheduleD200Response simulateSale(simulateSaleRequest)

Simulate a hypothetical sale to preview tax impact

### Example

```typescript
import { TaxApi, Configuration, SimulateSaleRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new TaxApi(configuration);

let simulateSaleRequest: SimulateSaleRequest; //

const { status, data } = await apiInstance.simulateSale(simulateSaleRequest);
```

### Parameters

| Name                    | Type                    | Description | Notes |
| ----------------------- | ----------------------- | ----------- | ----- |
| **simulateSaleRequest** | **SimulateSaleRequest** |             |       |

### Return type

**GetScheduleD200Response**

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
