const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";

export const APP_BASE_PATH =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";

export function buildPathWithBasePath(pathname: string): string {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (!APP_BASE_PATH) {
    return normalizedPathname;
  }

  if (normalizedPathname === "/") {
    return `${APP_BASE_PATH}/`;
  }

  return `${APP_BASE_PATH}${normalizedPathname}`;
}

export function buildUrlWithBasePath(
  pathname: string,
  searchParams?: Record<string, string | null | undefined>,
): string {
  const path = buildPathWithBasePath(pathname);

  if (typeof window === "undefined") {
    const url = new URL(path, "https://example.invalid");

    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (typeof value === "string" && value.length > 0) {
        url.searchParams.set(key, value);
      }
    }

    return `${url.pathname}${url.search}`;
  }

  const url = new URL(path, window.location.origin);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string" && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
