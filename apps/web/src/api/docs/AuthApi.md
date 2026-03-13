# AuthApi

All URIs are relative to _http://localhost:3001_

| Method                                | HTTP request                          | Description |
| ------------------------------------- | ------------------------------------- | ----------- |
| [**forgotPassword**](#forgotpassword) | **POST** /api/v1/auth/forgot-password |             |
| [**getMe**](#getme)                   | **GET** /api/v1/auth/me               |             |
| [**login**](#login)                   | **POST** /api/v1/auth/login           |             |
| [**refreshToken**](#refreshtoken)     | **POST** /api/v1/auth/refresh         |             |
| [**register**](#register)             | **POST** /api/v1/auth/register        |             |
| [**resetPassword**](#resetpassword)   | **POST** /api/v1/auth/reset-password  |             |
| [**verifyEmail**](#verifyemail)       | **GET** /api/v1/auth/verify-email     |             |

# **forgotPassword**

> ForgotPassword200Response forgotPassword(forgotPasswordRequest)

Request a password reset email

### Example

```typescript
import { AuthApi, Configuration, ForgotPasswordRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let forgotPasswordRequest: ForgotPasswordRequest; //

const { status, data } = await apiInstance.forgotPassword(
  forgotPasswordRequest,
);
```

### Parameters

| Name                      | Type                      | Description | Notes |
| ------------------------- | ------------------------- | ----------- | ----- |
| **forgotPasswordRequest** | **ForgotPasswordRequest** |             |       |

### Return type

**ForgotPassword200Response**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getMe**

> GetMe200Response getMe()

Get current authenticated user profile

### Example

```typescript
import { AuthApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

const { status, data } = await apiInstance.getMe();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**GetMe200Response**

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

# **login**

> AuthResponse login(loginInput)

Login with email and password to get a JWT token

### Example

```typescript
import { AuthApi, Configuration, LoginInput } from "./api";

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let loginInput: LoginInput; //

const { status, data } = await apiInstance.login(loginInput);
```

### Parameters

| Name           | Type           | Description | Notes |
| -------------- | -------------- | ----------- | ----- |
| **loginInput** | **LoginInput** |             |       |

### Return type

**AuthResponse**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **401**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **refreshToken**

> RefreshToken200Response refreshToken()

Refresh JWT token (requires valid existing token)

### Example

```typescript
import { AuthApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

const { status, data } = await apiInstance.refreshToken();
```

### Parameters

This endpoint does not have any parameters.

### Return type

**RefreshToken200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **401**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **register**

> AuthResponse register(registerInput)

Register a new user account

### Example

```typescript
import { AuthApi, Configuration, RegisterInput } from "./api";

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let registerInput: RegisterInput; //

const { status, data } = await apiInstance.register(registerInput);
```

### Parameters

| Name              | Type              | Description | Notes |
| ----------------- | ----------------- | ----------- | ----- |
| **registerInput** | **RegisterInput** |             |       |

### Return type

**AuthResponse**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **201**     | Default Response | -                |
| **409**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **resetPassword**

> ForgotPassword200Response resetPassword(resetPasswordRequest)

Reset password using the token from the reset email

### Example

```typescript
import { AuthApi, Configuration, ResetPasswordRequest } from "./api";

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let resetPasswordRequest: ResetPasswordRequest; //

const { status, data } = await apiInstance.resetPassword(resetPasswordRequest);
```

### Parameters

| Name                     | Type                     | Description | Notes |
| ------------------------ | ------------------------ | ----------- | ----- |
| **resetPasswordRequest** | **ResetPasswordRequest** |             |       |

### Return type

**ForgotPassword200Response**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Default Response | -                |
| **400**     | Default Response | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **verifyEmail**

> VerifyEmail200Response verifyEmail()

Verify email address using the token sent via email

### Example

```typescript
import { AuthApi, Configuration } from "./api";

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let token: string; // (default to undefined)

const { status, data } = await apiInstance.verifyEmail(token);
```

### Parameters

| Name      | Type         | Description | Notes                 |
| --------- | ------------ | ----------- | --------------------- |
| **token** | [**string**] |             | defaults to undefined |

### Return type

**VerifyEmail200Response**

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

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
