
export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * Builds a complete URL by combining the base URL, path, and optional query parameters.
 * @param baseUrl - The base URL.
 * @param path - The path to append to the base URL.
 * @param query - Optional query parameters to include in the URL.
 * @returns The constructed URL as a string.
 */
export const buildUrl = (
    baseUrl: string,
    path: string,
    query?: QueryParams
): string => {
    // normalize so a base with a path prefix (e.g. …/api/v1) is preserved:
    // ensure base ends with "/" and strip a leading "/" from path before resolving.
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(normalizedPath, normalizedBase)
    if (query) {
        Object.entries(query).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            url.searchParams.append(key, String(value));
        });
    }
    return url.toString();
}
