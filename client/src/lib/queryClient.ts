import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Bearer compatibility: if a bearer token was previously stored (pre-cookie
// migration), keep sending it alongside the session cookie until the cookie
// takes over on the next login/signup. Stored under the canonical Forge key.
const BEARER_STORAGE_KEY = "forge.auth.token";

function getBearerToken(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(BEARER_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export function setBearerToken(token: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (token) window.localStorage.setItem(BEARER_STORAGE_KEY, token);
    else window.localStorage.removeItem(BEARER_STORAGE_KEY);
  } catch {}
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  if (extra) {
    const src = new Headers(extra);
    src.forEach((v, k) => {
      headers[k] = v;
    });
  }
  const token = getBearerToken();
  if (token && !headers["Authorization"] && !headers["authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: buildHeaders(data ? { "Content-Type": "application/json" } : undefined),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: buildHeaders(),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
