
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
    const url = new URL(path, baseUrl)
    if (query) {
        Object.entries(query).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            url.searchParams.append(key, String(value));
        });
    }
    return url.toString();
}
