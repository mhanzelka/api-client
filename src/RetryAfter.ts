/**
 * Reads an HTTP `Retry-After` header value as a delay in milliseconds.
 *
 * The header comes in two forms: a number of seconds (`Retry-After: 2`) or an HTTP date
 * (`Retry-After: Wed, 21 Oct 2015 07:28:00 GMT`). Both are turned into "how long to wait from now".
 *
 * @param value the raw header value, as `headers.get("retry-after")` returns it
 * @param now the current time in ms since the epoch, for the date form; defaults to `Date.now()`
 * @returns the delay in ms (never negative), or undefined when the header is missing or unreadable
 */
export const parseRetryAfter = (
    value: string | null | undefined,
    now: number = Date.now()
): number | undefined => {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
        return Number(trimmed) * 1000;
    }

    const date = Date.parse(trimmed);

    if (Number.isNaN(date)) {
        return undefined;
    }

    return Math.max(0, date - now);
}
