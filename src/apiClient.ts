import {isRequestErrorFormat, RequestError, RequestErrorParams} from "./RequestError";
import {GeneralErrorCodes} from "./generalErrorCodes";
import {buildUrl, QueryParams} from "./UrlUtils";
import {combineSignals} from "./Signals";
import {parseRetryAfter} from "./RetryAfter";

/**
 * HTTP request methods supported by the API client.
 */
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * How a successful response body is read.
 * - `auto` (default): JSON for `application/json`, text for `text/*`, otherwise null.
 * - `json`, `text`, `blob`: read the body that way whatever its content type says.
 * - `response`: return the fetch `Response` itself, body unread (downloads, streaming, headers).
 *
 * Error responses are always read the `auto` way, so a failed download still yields a structured error.
 */
export type ResponseType = 'auto' | 'json' | 'text' | 'blob' | 'response';

/**
 * Per-request options.
 * @property query - Query parameters appended to the URL.
 * @property body - The request body: an object (sent as JSON), a string, or FormData.
 * @property headers - Headers for this request, over the client's own.
 * @property signal - Aborts the request; combined with the timeout, whichever fires first wins.
 * @property timeout - Timeout for this request in milliseconds, over the client's own.
 * @property responseType - How a successful body is read (see ResponseType); `auto` by default.
 * @property skipHooks - Skip `beforeRequest` and `onError` for this request (e.g. a health probe
 *   that must go out while the hook would hold everything back).
 */
export type RequestOptions<TBody = unknown> = {
    query?: QueryParams;
    body?: TBody;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
    responseType?: ResponseType;
    skipHooks?: boolean;
}

/**
 * What a hook knows about the request it runs for.
 * @property method - The HTTP method.
 * @property path - The path as the caller passed it (a namespace's prefix included).
 * @property options - The request's options.
 */
export type RequestContext = {
    method: RequestMethod;
    path: string;
    options: RequestOptions;
}

/**
 * Configuration options for the API client.
 * @property baseUrl - The base URL for the API.
 * @property timeout - Optional timeout duration for requests in milliseconds.
 * @property headers - Optional default headers to include in every request.
 * @property credentials - Optional credentials mode for requests (e.g., "include", "same-origin").
 * @property allowedOrigins - Optional list of allowed origins for CORS requests.
 * @property getToken - Optional function to retrieve an authorization token for requests.
 * @property onUnauthorized - Optional callback function to handle unauthorized (401) responses.
 * @property beforeRequest - Optional hook awaited before every request, before its timeout starts.
 *   Throwing from it fails the request with that error and nothing is sent; awaiting in it delays
 *   the request (a guard, a throttle, a token refresh).
 * @property onError - Optional hook awaited with every failed request's error before it is thrown
 *   (HTTP errors, timeouts, aborts, network errors). The same error is thrown afterwards; throwing
 *   from the hook replaces it.
 * @property parseError - Optional reader of an error response body. Return the error's fields to
 *   use them, or null to fall back to the default (`isRequestErrorFormat`, then a generic error).
 *   `http_status`, `path`, `headers` and `retryAfterMs` are filled in from the response when the
 *   returned fields leave them out.
 */
export type ApiClientConfig = {
    baseUrl: string;
    timeout?: number;
    headers?: Record<string, string>;
    credentials?: RequestCredentials;
    allowedOrigins?: string[];
    getToken?: () => string | null | undefined;
    onUnauthorized?: (error?: RequestError) => Promise<void>;
    beforeRequest?: (context: RequestContext) => void | Promise<void>;
    onError?: (error: RequestError, context: RequestContext) => void | Promise<void>;
    parseError?: (data: unknown, response: Response) => RequestErrorParams | null | undefined;
}

export type TimeoutSignal = {
    signal?: AbortSignal;
    clear: () => void;
}

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

const isAbortError = (e: unknown): boolean =>
    e !== null && typeof e === "object" && "name" in e && e.name === "AbortError";

/**
 * Reads a response body by its content type: JSON, text, or null for anything else.
 * A body that fails to parse reads as null rather than failing the request.
 */
const readAuto = async (response: Response): Promise<unknown> => {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
        return response.json().catch(() => null);
    }
    if (contentType.includes("text/")) {
        return response.text().catch(() => null);
    }
    return null;
}

/**
 * Reads a successful response the way the request asked for (see ResponseType).
 */
const readBody = async (response: Response, responseType: ResponseType): Promise<unknown> => {
    switch (responseType) {
        case "response":
            return response;
        case "json":
            return response.json().catch(() => null);
        case "text":
            return response.text();
        case "blob":
            return response.blob();
        default:
            return readAuto(response);
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

    // builds the error for a non-ok response: the app's own parser first, then the default format
    const responseError = (data: unknown, response: Response, path: string): RequestError => {
        const parsed = config.parseError?.(data, response)
            ?? (data && isRequestErrorFormat(data) ? data : null);
        const fallback: RequestErrorParams = {
            message: `Request failed with status ${response.status} ${response.statusText}`,
            code: GeneralErrorCodes.UNKNOWN_REQUEST_ERROR,
        };

        return new RequestError({
            ...(parsed ?? fallback),
            http_status: parsed?.http_status ?? response.status,
            body: parsed?.body ?? (data ?? undefined),
            path: parsed?.path ?? path,
            headers: parsed?.headers ?? response.headers,
            retryAfterMs: parsed?.retryAfterMs ?? parseRetryAfter(response.headers.get("retry-after")),
        });
    }

    // core request method
    const request = async <TResponse, TRequestBody = unknown>(
        method: RequestMethod,
        path: string,
        options: RequestOptions<TRequestBody> = {}
    ): Promise<TResponse> => {
        const context: RequestContext = {method, path, options};
        const hooks = !options.skipHooks;

        // awaited before anything else, so a hook that waits does not eat into the timeout
        if (hooks && config.beforeRequest) {
            await config.beforeRequest(context);
        }

        // build url with query params
        const url = buildUrl(config.baseUrl, path, options.query);

        // the caller's signal and the timeout both abort the request, whichever fires first
        const timeoutMs = options.timeout ?? config.timeout;
        const timeout = createTimeoutSignal(timeoutMs);
        const signal = combineSignals(options.signal, timeout.signal);

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
        let response: Response | null = null;
        let requestError: RequestError | null = null;

        try {
            response = await fetch(url, init);

            // clear timeout
            timeout.clear();

            data = response.ok
                ? await readBody(response, options.responseType ?? "auto")
                : await readAuto(response);
        } catch (e: unknown) {
            // clear timeout
            timeout.clear();

            if (isAbortError(e)) {
                // the timeout's own signal tells a timeout apart from the caller giving up
                const timedOut = timeout.signal?.aborted === true && options.signal?.aborted !== true;
                requestError = new RequestError({
                    message: timedOut ? `Request timed out after ${timeoutMs} ms` : `Request was aborted`,
                    code: timedOut ? GeneralErrorCodes.REQUEST_TIMEOUT : GeneralErrorCodes.ABORTED,
                    path,
                    details: e,
                });
            } else {
                // generic network error
                requestError = new RequestError({
                    message: `Request failed: ${e}`,
                    code: GeneralErrorCodes.UNKNOWN_NETWORK_ERROR,
                    path,
                    details: e,
                });
            }
        }

        // handle non-ok responses
        if (!requestError && response && !response.ok) {
            requestError = responseError(data, response, path);

            // if 401 Unauthorized and onUnauthorized handler is set, invoke it to handle re-authentication
            if (response.status === 401 && config.onUnauthorized) {
                await config.onUnauthorized(requestError);
            }
        }

        if (requestError) {
            if (hooks && config.onError) {
                await config.onError(requestError, context);
            }
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
