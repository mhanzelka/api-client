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
