import {isRequestErrorFormat, RequestError} from "./RequestError";
import {GeneralErrorCodes} from "./generalErrorCodes";
import {buildUrl, QueryParams} from "./UrlUtils";

/**
 * Configuration options for the API client.
 * @property baseUrl - The base URL for the API.
 * @property timeout - Optional timeout duration for requests in milliseconds.
 * @property headers - Optional default headers to include in every request.
 * @property credentials - Optional credentials mode for requests (e.g., "include", "same-origin").
 * @property allowedOrigins - Optional list of allowed origins for CORS requests.
 * @property getToken - Optional function to retrieve an authorization token for requests.
 * @property onUnauthorized - Optional callback function to handle unauthorized (401) responses.
 */
export type ApiClientConfig = {
    baseUrl: string;
    timeout?: number;
    headers?: Record<string, string>;
    credentials?: RequestCredentials;
    allowedOrigins?: string[];
    getToken?: () => string | null | undefined;
    onUnauthorized?: (error?: RequestError) => Promise<void>;
}


export type RequestOptions<TBody = unknown> = {
    query?: QueryParams;
    body?: TBody;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
}

export type TimeoutSignal = {
    signal?: AbortSignal;
    clear: () => void;
}

/**
 * HTTP request methods supported by the API client.
 */
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Creates a timeout signal for aborting requests after a specified duration.
 * @param timeout
 */
const createTimeoutSignal = (
    timeout?: number
): TimeoutSignal => {
    if (!timeout) return { clear: () => {}}
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeout);
    return {
        signal: controller.signal,
        clear: () => clearTimeout(timeoutId)
    }
}

/**
 * Creates an API client with configurable settings and methods for making HTTP requests.
 * @param initialConfig - The initial configuration for the API client.
 * @returns An object containing methods for making HTTP requests (get, post, put, patch, delete) and configuring the client.
 */
export const createApiClient = (
    initialConfig: Partial<ApiClientConfig>
) => {

    let config: ApiClientConfig = {
        baseUrl: "",
        timeout: undefined,
        headers: {},
        credentials: "include",
        getToken: undefined,
        ...(initialConfig || {}),
    };

    // patch the existing config with new values
    const configure = (next: Partial<ApiClientConfig>) => {
        config = {
            ...config,
            ...next,
            headers: {
                ...config.headers,
                ...(next.headers || {}),
            },
        };
    };

    // single subscription for unauthorized handler
    const onUnauthorized = (onUnauthorized: ApiClientConfig["onUnauthorized"]) => {
        configure({onUnauthorized})
        return () => {
            configure({
                onUnauthorized: undefined
            })
        }
    }

    // core request method
    const request = async <TResponse, TRequestBody = unknown>(
        method: RequestMethod,
        path: string,
        options: RequestOptions<TRequestBody> = {}
    ): Promise<TResponse> => {
        // build url with query params
        const url = buildUrl(config.baseUrl, path, options.query);

        // create timeout signal
        const {signal, clear} = createTimeoutSignal(options.timeout ?? config.timeout);

        // build headers
        const headers: Record<string, string> = {
            ...(options.body ? {"Content-Type": "application/json"} : {}),
            ...(config.headers || {}),
            ...(options.headers || {})
        }

        // if token provider is set, get the token and add Authorization header as Bearer
        const token = config.getToken?.();
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        // if body is FormData, delete Content-Type to allow browser to set correct boundary
        const isForm = options.body instanceof FormData;
        if (isForm) {
            delete headers["Content-Type"];
        }

        // build fetch init object
        const init: RequestInit = {
            method,
            headers,
            signal,
            credentials: config.credentials || "include",
        }

        // attach body if present and method is not GET
        if (options.body !== undefined && method !== "GET") {
            if (isForm) {
                init.body = options.body as FormData;
            } else {
                init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
            }
        }

        let data: unknown = null;
        let requestError: RequestError | null = null;

        try {
            const response = await fetch(url, init);

            // clear timeout
            clear();

            const contentType = response.headers.get("content-type") ?? "";


            if (contentType.includes("application/json")) {
                data = await response.json().catch(() => null)
            } else if (contentType.includes("text/")) {
                data = await response.text().catch(() => null)
            }

            // handle non-ok responses
            if (!response.ok) {
                // check if response body matches RequestError format and create RequestError accordingly,
                // otherwise create a generic RequestError
                if (data && isRequestErrorFormat(data)) {
                    requestError = new RequestError(data);
                } else {
                    requestError = new RequestError({
                        message: `Request failed with status ${response.status} ${response.statusText}`,
                        code: GeneralErrorCodes.UNKNOWN_REQUEST_ERROR,
                        http_status: response.status,
                        body: data || undefined,
                    });
                }

                // if 401 Unauthorized and onUnauthorized handler is set, invoke it to handle re-authentication
                if (response.status === 401 && config.onUnauthorized) {
                    await config.onUnauthorized(requestError);
                }
            }

        } catch (e: unknown) {
            // clear timeout
            clear();

            // handle fetch errors (network issues, timeouts, aborts)
            if (e !== null && typeof e === `object` && "name" in e && e?.name === "AbortError") {
                requestError = new RequestError({
                    message: `Request timed out or was aborted`,
                    code: GeneralErrorCodes.REQUEST_TIMEOUT
                });
            }

            // generic network error
            requestError = new RequestError({
                message: `Request failed with status ${e}`,
                code: GeneralErrorCodes.UNKNOWN_NETWORK_ERROR
            })
        }

        if (requestError) {
            throw requestError;
        }

        return data as TResponse;
    }

    return {
        configure,
        onUnauthorized,
        get: <TResponse = unknown>(path: string, options?: RequestOptions) =>
            request<TResponse>("GET", path, options),
        post: <TResponse = unknown>(path: string, options?: RequestOptions) =>
            request<TResponse>("POST", path, options),
        postForm: <TResponse = unknown>(path: string, formData: FormData, options?: Omit<RequestOptions, "body">) =>
            request<TResponse, FormData>("POST", path, { ...options, body: formData }),
        put: <TResponse = unknown>(path: string, options?: RequestOptions) =>
            request<TResponse>("PUT", path, options),
        patch: <TResponse = unknown>(path: string, options?: RequestOptions) =>
            request<TResponse>("PATCH", path, options),
        delete: <TResponse = unknown>(path: string, options?: RequestOptions) =>
            request<TResponse>("DELETE", path, options),
    }
}

export type Api = ReturnType<typeof createApiClient>;
export type ApiAttribute = keyof Api;
