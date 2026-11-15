# @mhanzelka/api-client

Tiny typed fetch-based API client (factory, structured errors, namespaces).

## Install

```sh
npm install @mhanzelka/api-client
```

## Usage

```ts
import { createApiClient } from "@mhanzelka/api-client";

const api = createApiClient({ baseUrl: "https://example.com/api", getToken: () => token });

const data = await api.get("/users");
```

### FormData uploads

```ts
const fd = new FormData();
fd.append("file", file);

const result = await api.postForm("/upload", fd);
```

### Namespaces

```ts
import { createApiClient, makeNamespacedApi } from "@mhanzelka/api-client";

const api = makeNamespacedApi(createApiClient({ baseUrl: "https://example.com" }), {
  users: "/api/users",
  posts: "/api/posts",
});

await api.users.get("/me");
await api.posts.post("/", { body: { title: "Hello" } });
```

### Errors

Failed requests throw a `RequestError` with structured fields (`code`, `http_status`, `body`, ...).

```ts
import { isRequestError } from "@mhanzelka/api-client";

try {
  await api.get("/protected");
} catch (e) {
  if (isRequestError(e)) {
    console.error(e.code, e.http_status);
  }
}
```

The error's `path` is the request path; `headers` and `retryAfterMs` (the server's `Retry-After` in ms)
are set when the server answered. Without an answer the `code` says why:

| `code` | When |
|--------|------|
| `REQUEST_TIMEOUT` | the client's `timeout` ran out |
| `ABORTED` | the caller's `signal` aborted the request |
| `UNKNOWN_NETWORK_ERROR` | no response at all (offline, DNS, CORS) |
| `UNKNOWN_REQUEST_ERROR` | a non-ok response whose body is not a recognised error |

### Your own error format

By default an error body is lifted into the error only when it has `message`, `http_status` and `code`.
`parseError` reads any other shape; return null to fall back to the default:

```ts
const api = createApiClient({
  baseUrl,
  // the backend answers { code, title, status }
  parseError: (data) => {
    const body = data as { code?: string; title?: string } | null;
    return body?.code ? { code: body.code, message: body.title ?? body.code, body } : null;
  },
});
```

`http_status`, `path`, `headers` and `retryAfterMs` are filled in from the response when you leave them out.

### Aborting

`signal` aborts the request; it works together with `timeout`, whichever fires first:

```ts
const controller = new AbortController();
const tiles = api.get("/tiles", { signal: controller.signal });
controller.abort(); // rejects with code ABORTED
```

### Hooks

`beforeRequest` is awaited before every request, before its timeout starts: throw to refuse it (nothing is
sent), wait in it to delay it. `onError` is awaited with every failed request's error before it is thrown;
throwing from it replaces the error. `skipHooks: true` sends one request past both:

```ts
const api = createApiClient({
  baseUrl,
  beforeRequest: ({ path }) => {
    if (maintenance.active) throw new RequestError({ message: "Under maintenance", code: "maintenance", path });
  },
  onError: (error) => {
    if (error.code === "maintenance") maintenance.enter();
  },
});

await api.get("/maintenance", { skipHooks: true }); // the probe that must go out anyway
```

### Response types

A successful body is read by its content type (`responseType: "auto"`). Ask for another reading when the
endpoint answers with something else:

```ts
const gpx = await api.get<string>("/track.gpx", { responseType: "text" });
const image = await api.get<Blob>("/avatar.png", { responseType: "blob" });
const raw = await api.get<Response>("/export", { responseType: "response" }); // body unread
```

Error responses are always read by content type, so a failed download still gives a structured error.
