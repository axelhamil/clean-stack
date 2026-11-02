export const IP_HEADERS = ["forwarded", "-ip", "remote-", "via", "-user"];

const DENIED_HEADERS = ["cookie", "Cookie", "authorization", "Authorization", "x-csrf-token"];
const URL_KEYS = new Set(["url", "from", "to"]);
const DROPPED_BREADCRUMB_CATEGORIES = new Set(["console"]);
const QUERY_PARAMS_MARKER = "\nparams:";
const QUERY_IN_TOKEN = /(?<!\S)([^\s?#]*)([?#]\S*)/g;
const QUERY_HINT = /[=/]/;
const EMAIL = /(?<![^\s@<>()"',;:])[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi;
const MAX_DEPTH = 10;

export interface ScrubbableBreadcrumb {
  category?: string | undefined;
  message?: string | undefined;
  data?: Record<string, unknown> | undefined;
}

export interface ScrubbableLog {
  message: string;
  attributes?: Record<string, unknown> | undefined;
}

export interface ScrubbableEvent {
  message?: string | undefined;
  exception?: { values?: { value?: string | undefined }[] | undefined } | undefined;
  request?:
    | {
        cookies?: unknown;
        data?: unknown;
        query_string?: unknown;
        headers?: Record<string, string | undefined> | undefined;
      }
    | undefined;
  user?:
    | {
        email?: string | undefined;
        username?: string | undefined;
        ip_address?: string | null | undefined;
      }
    | undefined;
  contexts?: Record<string, unknown> | undefined;
  extra?: Record<string, unknown> | undefined;
  breadcrumbs?: ScrubbableBreadcrumb[] | undefined;
}

function cleanUrl(url: string): string {
  const [withoutQuery = ""] = url.split(/[?#]/);

  return withoutQuery;
}

export function scrubText(text: string): string {
  const [withoutParams = ""] = text.split(QUERY_PARAMS_MARKER);

  return withoutParams.replace(QUERY_IN_TOKEN, dropQuery).replace(EMAIL, "[email]");
}

function dropQuery(token: string, beforeQuery: string, query: string): string {
  const looksLikeQuery = beforeQuery.includes("/") || QUERY_HINT.test(query);

  return looksLikeQuery ? beforeQuery : token;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function cleanDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item) => cleanDeep(item, depth + 1));
  if (!isPlainObject(value)) return value;

  return mapValues(value, (_, item) => cleanDeep(item, depth + 1));
}

function mapValues(
  record: Record<string, unknown>,
  map: (key: string, value: unknown) => unknown,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, map(key, value)]));
}

function cleanRecord(record: Record<string, unknown>): Record<string, unknown> {
  return mapValues(record, (_, value) => cleanDeep(value));
}

function cleanBreadcrumbEntry(key: string, value: unknown): unknown {
  if (URL_KEYS.has(key) && typeof value === "string") return scrubText(cleanUrl(value));

  return cleanDeep(value);
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const { request, user } = event;

  if (request) {
    request.cookies = undefined;
    request.data = undefined;
    request.query_string = undefined;
    for (const name of DENIED_HEADERS) if (request.headers) request.headers[name] = undefined;
  }

  if (user) {
    user.email = undefined;
    user.username = undefined;
    user.ip_address = undefined;
  }

  if (event.message) event.message = scrubText(event.message);

  for (const exception of event.exception?.values ?? [])
    if (exception.value) exception.value = scrubText(exception.value);

  if (event.contexts) event.contexts = cleanRecord(event.contexts);
  if (event.extra) event.extra = cleanRecord(event.extra);

  if (event.breadcrumbs)
    event.breadcrumbs = event.breadcrumbs.flatMap(
      (breadcrumb) => scrubBreadcrumb(breadcrumb) ?? [],
    );

  return event;
}

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B | null {
  if (breadcrumb.category && DROPPED_BREADCRUMB_CATEGORIES.has(breadcrumb.category)) return null;

  if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
  if (breadcrumb.data) breadcrumb.data = mapValues(breadcrumb.data, cleanBreadcrumbEntry);

  return breadcrumb;
}

export function scrubLog<L extends ScrubbableLog>(log: L): L {
  log.message = scrubText(log.message);
  if (log.attributes) log.attributes = cleanRecord(log.attributes);

  return log;
}
