import {Api, ApiAttribute, RequestOptions} from "./apiClient";

const joinPath = (a: string, b: string) =>
    `${a}`.replace(/\/+$/,'') + '/' + `${b}`.replace(/^\/+/,'');


const methodNames = ['get', 'post', 'put', 'patch', 'delete'] as const;

type HttpMethod = typeof methodNames[number];
type Methods = Record<HttpMethod, <TData>(path: string, options?: RequestOptions) => Promise<TData>>;

const withBasePath = (api: Api, base: string): Api => {
    const methods = methodNames.reduce((acc, method) => {
        const call = api[method];
        acc[method] = async (path: string, options?: RequestOptions) => {
            return call(joinPath(base, path), options);
        }
        return acc;
    }, {} as Methods)
    return {
        ...api,
        ...methods
    }
}

type Namespaces = Record<string, string>;
type NamespacedApi<T extends Namespaces> = Api & {
    [K in keyof T]: Api
}

export const makeNamespacedApi = <T extends Namespaces>(
    api: Api,
    namespaces: T
): NamespacedApi<T> => {
    return Object.entries(namespaces)
        .reduce((acc, [namespace, base]) => {
            return {
                ...acc,
                [namespace]: withBasePath(api, base)
            }
        }, {...api} as NamespacedApi<T>)
}
