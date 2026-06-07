export interface RequestErrorParams<TBody = unknown> {
    message: string;
    status?: number;
    http_status?: number;
    code: string | number;
    body?: TBody | null;
    path?: string;
    details?: unknown;
}

export const isRequestErrorFormat = (obj: unknown): obj is RequestErrorParams  => {
    return obj !== null
        && typeof obj === "object"
        && 'message' in obj
        && typeof obj.message === "string"
        && 'http_status' in obj
        && typeof obj.http_status === "number"
        && 'code' in obj
        && (typeof obj .code === "string" || typeof obj.code === "number");
}

export const isRequestError = (obj: unknown): obj is RequestError => {
    return obj instanceof RequestError;
}

/**
 * Custom error class to represent HTTP request errors.
 * Includes additional properties such as status code, error code, response body, request path, and details.
 * Useful for handling and parsing API errors in a structured way.
 * @param params - The parameters for constructing the RequestError.
 * @param params.message - The error message.
 * @param params.status - The HTTP status code of the error.
 * @param params.code - An optional error code associated with the error.
 * @param params.body - An optional response body associated with the error.
 * @param params.path - An optional request path that caused the error.
 * @param params.details - Optional additional details about the error.
 * @template TBody - The type of the response body associated with the error.
 */
export class RequestError<TBody = unknown> extends Error {
    status?: number;
    http_status?: number;
    code: string | number;
    body: TBody | null;
    path?: string;
    details?: unknown;

    constructor(params: RequestErrorParams<TBody>) {
        super(params.message);
        this.name = "RequestError";
        this.status = params.status;
        this.http_status = params.http_status;
        this.code = params.code;
        this.body = params.body ?? null;
        this.path = params.path;
        this.details = params.details;
    }

    toString() {
        return `${this.name}: ${this.message} (${this.status})${this.http_status ? ` [httpCode: ${this.http_status}]` : ""}${this.path ? ` at ${this.path}` : ""}`;
    }
}
