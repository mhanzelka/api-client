/**
 * Combines several abort signals into one that aborts as soon as any of them does.
 *
 * Used to honour the caller's own `signal` next to the client's timeout: fetch takes a single
 * signal, and dropping the caller's one means an abandoned request keeps running to the end.
 * `AbortSignal.any` does exactly this where it exists; React Native and older browsers lack it,
 * so a plain controller wired to every input is the fallback.
 *
 * @param signals the signals to combine; undefined entries are skipped
 * @returns undefined when none is given, the signal itself when only one is, else a combined signal
 *   whose `reason` is the reason of the first input that aborted
 */
export const combineSignals = (
    ...signals: (AbortSignal | undefined)[]
): AbortSignal | undefined => {
    const present = signals.filter((signal): signal is AbortSignal => signal !== undefined);

    if (present.length <= 1) {
        return present[0];
    }

    if (typeof AbortSignal.any === "function") {
        return AbortSignal.any(present);
    }

    const controller = new AbortController();
    const listeners: Array<[AbortSignal, () => void]> = [];

    // Detach from every input once the combined signal fired, so a long-lived caller signal does
    // not collect one listener per request it was ever passed to.
    const abortWith = (source: AbortSignal) => {
        controller.abort(source.reason);
        listeners.forEach(([signal, listener]) => signal.removeEventListener("abort", listener));
    };

    for (const signal of present) {
        if (signal.aborted) {
            abortWith(signal);
            return controller.signal;
        }
        const listener = () => abortWith(signal);
        listeners.push([signal, listener]);
        signal.addEventListener("abort", listener, {once: true});
    }

    return controller.signal;
}
