/**
 * The typed API client — the ONLY place in the web app that talks to the network.
 *
 * Rules for every other frontend module:
 *  - never call `fetch` yourself, import a function from here,
 *  - every argument/return type comes from `@toon/shared` (the frozen contract),
 *  - errors are always an {@link ApiError} (code + message + HTTP status).
 *
 * Session handling: the API sets an HttpOnly cookie, so every request goes out with
 * `credentials: "include"`. A 401 on a guarded endpoint triggers the global
 * unauthorized handler (see {@link setUnauthorizedHandler}), which sends the user to
 * `/login?next=<current path>`.
 */
import type {
  AcceptInviteRequest,
  AcceptInviteResponse,
  AccrualRunListResponse,
  AuthSessionResponse,
  BalanceHistoryQuery,
  BalanceHistoryResponse,
  BalanceQuery,
  BalanceResponse,
  CategoryListResponse,
  CategoryResponse,
  ChangePasswordRequest,
  CreateCategoryRequest,
  CreateFixedCostItemRequest,
  CreateHouseholdRequest,
  CreateIncomeRequest,
  CreateInviteRequest,
  CreateSettlementRequest,
  CreateTransactionRequest,
  FixedCostItemResponse,
  ForgotPasswordRequest,
  HealthResponse,
  HouseholdDetailResponse,
  HouseholdListResponse,
  HouseholdResponse,
  IncomeResponse,
  InviteListResponse,
  InvitePreviewResponse,
  InviteResponse,
  LoginRequest,
  MemberListResponse,
  MeResponse,
  PaginationQuery,
  PlanComputationResponse,
  PlanResponse,
  RecalculatePlanRequest,
  RecalculatePlanResponse,
  RegisterRequest,
  ResetPasswordRequest,
  RunPlanRequest,
  RunPlanResponse,
  SessionListResponse,
  SettlementResponse,
  TagListResponse,
  TagResponse,
  TransactionListQuery,
  TransactionListResponse,
  TransactionResponse,
  TransactionSummaryQuery,
  TransactionSummaryResponse,
  UpdateCategoryRequest,
  UpdateFixedCostItemRequest,
  UpdateHouseholdRequest,
  UpdateIncomeRequest,
  UpdateMemberRequest,
  UpdateProfileRequest,
  UpdateTagRequest,
  UpdateTransactionRequest,
  UserResponse,
} from "@toon/shared";
import { getLocale, translate } from "@/lib/i18n/store.ts";

/* -------------------------------------------------------------------------- */
/* base url                                                                   */
/* -------------------------------------------------------------------------- */

const buildEnv = import.meta.env as unknown as Record<string, string | undefined>;

/**
 * Base URL of the API without a trailing slash. `PUBLIC_API_URL` is the
 * documented name (root .env, inlined by vite); `VITE_API_URL` is accepted as
 * an alias. Empty string (the Docker default, single-origin) resolves to
 * relative URLs.
 */
export const API_BASE_URL: string = (buildEnv.PUBLIC_API_URL ?? buildEnv.VITE_API_URL ?? "").replace(
  /\/+$/,
  "",
);

/** Absolute-or-relative URL for an API path. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/* -------------------------------------------------------------------------- */
/* errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every failed request throws this. `code` is one of `ERROR_CODES` from
 * `@toon/shared` (plus the client-only `network_error`).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(options: { code: string; message: string; status: number; details?: unknown }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }

  /** 4xx = the user can fix it; retrying is pointless. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isOffline(): boolean {
    return this.code === "network_error";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** User-facing message for any thrown value, in the active locale. Safe to render directly. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return translate("common.errorGeneric");
}

/* -------------------------------------------------------------------------- */
/* 401 handling                                                               */
/* -------------------------------------------------------------------------- */

type UnauthorizedHandler = (next: string) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let lastRedirectAt = 0;

/**
 * Registered once by `lib/session.tsx` so a 401 can be handled with a
 * client-side navigation instead of a full page load.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/password/")
  ) {
    return;
  }
  // Never loop: at most one redirect per second.
  const now = Date.now();
  if (now - lastRedirectAt < 1000) return;
  lastRedirectAt = now;

  const next = `${pathname}${search}${hash}`;
  if (unauthorizedHandler) {
    unauthorizedHandler(next);
    return;
  }
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

/* -------------------------------------------------------------------------- */
/* core request                                                               */
/* -------------------------------------------------------------------------- */

export type QueryValue = string | number | boolean | null | undefined;

/** Builds `?a=1&b=x`, skipping null/undefined/"" values. */
export function queryString(params: Record<string, QueryValue> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export interface RequestOptions {
  signal?: AbortSignal | undefined;
  /** Skip the global 401 -> /login redirect (bootstrap + public auth screens use this). */
  allowUnauthorized?: boolean;
}

interface RequestInput extends RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

async function request<T>(path: string, input: RequestInput = {}): Promise<T> {
  const { method = "GET", body, signal, allowUnauthorized } = input;

  // Accept-Language is CORS-safelisted, so this adds no preflight — the
  // server negotiates `error.message`'s locale from it (docs/spec.md §3.1).
  const headers: Record<string, string> = { Accept: "application/json", "Accept-Language": getLocale() };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      credentials: "include",
      headers,
      body: payload,
      signal: signal ?? null,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError({
      code: "network_error",
      status: 0,
      message: translate("common.errorOffline"),
      details: cause,
    });
  }

  if (response.status === 401 && !allowUnauthorized) handleUnauthorized();

  if (response.status === 204 || response.status === 205) return undefined as T;

  const raw = await response.text();
  let parsed: unknown = undefined;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) throw toApiError(response.status, parsed, raw);
  return parsed as T;
}

function toApiError(status: number, parsed: unknown, raw: string): ApiError {
  const envelope =
    typeof parsed === "object" && parsed !== null && "error" in parsed
      ? (parsed as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error
      : undefined;

  const code = typeof envelope?.code === "string" ? envelope.code : fallbackCode(status);
  const message =
    typeof envelope?.message === "string" && envelope.message.length > 0
      ? envelope.message
      : fallbackMessage(status, raw);

  return new ApiError({ code, message, status, details: envelope?.details });
}

function fallbackCode(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation_failed";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal_error";
  return "bad_request";
}

function fallbackMessage(status: number, raw: string): string {
  if (status >= 500) return translate("common.errorGeneric");
  return raw.slice(0, 200) || translate("common.errorGeneric");
}

/* -------------------------------------------------------------------------- */
/* health                                                                     */
/* -------------------------------------------------------------------------- */

export function fetchHealth(options?: RequestOptions): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health", { ...options, allowUnauthorized: true });
}

/* -------------------------------------------------------------------------- */
/* auth                                                                       */
/* -------------------------------------------------------------------------- */

export function registerAccount(
  body: RegisterRequest,
  options?: RequestOptions,
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>("/api/auth/register", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

export function loginWithPassword(
  body: LoginRequest,
  options?: RequestOptions,
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>("/api/auth/login", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

export function logout(options?: RequestOptions): Promise<void> {
  return request<void>("/api/auth/logout", { ...options, method: "POST", allowUnauthorized: true });
}

/** Bootstrap call: user + households + activeHouseholdId. 401 here is normal (= logged out). */
export function fetchMe(options?: RequestOptions): Promise<MeResponse> {
  return request<MeResponse>("/api/auth/me", { ...options, allowUnauthorized: true });
}

export function updateProfile(body: UpdateProfileRequest, options?: RequestOptions): Promise<UserResponse> {
  return request<UserResponse>("/api/auth/me", { ...options, method: "PATCH", body });
}

export function changePassword(body: ChangePasswordRequest, options?: RequestOptions): Promise<void> {
  return request<void>("/api/auth/password", { ...options, method: "POST", body });
}

/**
 * "Passwort vergessen" — ALWAYS resolves. The API answers 204 whether or not
 * the account exists (no user enumeration), so the calling screen must show
 * the same confirmation either way.
 */
export function requestPasswordReset(body: ForgotPasswordRequest, options?: RequestOptions): Promise<void> {
  return request<void>("/api/auth/password/forgot", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

/**
 * Spends a reset token from a mailed link. On success EVERY session of that
 * user is gone, and the user must sign in again — the screen navigates to
 * `/login?reset=1`.
 */
export function resetPassword(body: ResetPasswordRequest, options?: RequestOptions): Promise<void> {
  return request<void>("/api/auth/password/reset", {
    ...options,
    method: "POST",
    body,
    allowUnauthorized: true,
  });
}

export function fetchSessions(options?: RequestOptions): Promise<SessionListResponse> {
  return request<SessionListResponse>("/api/auth/sessions", options);
}

/** `handle`, never the raw session id — see `GET /api/auth/sessions` (docs/spec.md §3.4). */
export function revokeSession(handle: string, options?: RequestOptions): Promise<void> {
  return request<void>(`/api/auth/sessions/${encodeURIComponent(handle)}`, {
    ...options,
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* households, members, invites                                              */
/* -------------------------------------------------------------------------- */

export function fetchHouseholds(options?: RequestOptions): Promise<HouseholdListResponse> {
  return request<HouseholdListResponse>("/api/households", options);
}

export function createHousehold(
  body: CreateHouseholdRequest,
  options?: RequestOptions,
): Promise<HouseholdResponse> {
  return request<HouseholdResponse>("/api/households", { ...options, method: "POST", body });
}

/** Public invite preview for the landing page — works without a session. */
export function fetchInvitePreview(token: string, options?: RequestOptions): Promise<InvitePreviewResponse> {
  return request<InvitePreviewResponse>(`/api/households/invites/${encodeURIComponent(token)}`, {
    ...options,
    allowUnauthorized: true,
  });
}

export function acceptInvite(
  body: AcceptInviteRequest,
  options?: RequestOptions,
): Promise<AcceptInviteResponse> {
  return request<AcceptInviteResponse>("/api/households/invites/accept", {
    ...options,
    method: "POST",
    body,
  });
}

export function fetchHousehold(
  householdId: string,
  options?: RequestOptions,
): Promise<HouseholdDetailResponse> {
  return request<HouseholdDetailResponse>(`/api/households/${householdId}`, options);
}

export function updateHousehold(
  householdId: string,
  body: UpdateHouseholdRequest,
  options?: RequestOptions,
): Promise<HouseholdResponse> {
  return request<HouseholdResponse>(`/api/households/${householdId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function fetchHouseholdMembers(
  householdId: string,
  options?: RequestOptions,
): Promise<MemberListResponse> {
  return request<MemberListResponse>(`/api/households/${householdId}/members`, options);
}

/** Renames the CALLER's own display name — the API 403s on any other userId. */
export function updateMemberDisplayName(
  householdId: string,
  userId: string,
  body: UpdateMemberRequest,
  options?: RequestOptions,
): Promise<MemberListResponse["items"][number]> {
  return request(`/api/households/${householdId}/members/${userId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

/** Leaves the household — only ever the caller's own membership. 409 `member_has_ledger`. */
export function leaveHousehold(householdId: string, userId: string, options?: RequestOptions): Promise<void> {
  return request<void>(`/api/households/${householdId}/members/${userId}`, {
    ...options,
    method: "DELETE",
  });
}

export function fetchHouseholdInvites(
  householdId: string,
  options?: RequestOptions,
): Promise<InviteListResponse> {
  return request<InviteListResponse>(`/api/households/${householdId}/invites`, options);
}

export function createHouseholdInvite(
  householdId: string,
  body: CreateInviteRequest,
  options?: RequestOptions,
): Promise<InviteResponse> {
  return request<InviteResponse>(`/api/households/${householdId}/invites`, {
    ...options,
    method: "POST",
    body,
  });
}

export function revokeHouseholdInvite(
  householdId: string,
  inviteId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`/api/households/${householdId}/invites/${inviteId}`, {
    ...options,
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* transactions                                                               */
/* -------------------------------------------------------------------------- */

function transactionsBase(householdId: string): string {
  return `/api/households/${householdId}/transactions`;
}

export function fetchTransactions(
  householdId: string,
  query: Partial<TransactionListQuery> = {},
  options?: RequestOptions,
): Promise<TransactionListResponse> {
  return request<TransactionListResponse>(
    `${transactionsBase(householdId)}${queryString({
      from: query.from,
      to: query.to,
      kind: query.kind,
      splitMode: query.splitMode,
      payerId: query.payerId,
      categoryId: query.categoryId,
      tagIds: query.tagIds,
      origin: query.origin,
      q: query.q,
      includeAggregates: query.includeAggregates,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    })}`,
    options,
  );
}

export function createTransaction(
  householdId: string,
  body: CreateTransactionRequest,
  options?: RequestOptions,
): Promise<TransactionResponse> {
  return request<TransactionResponse>(transactionsBase(householdId), { ...options, method: "POST", body });
}

export function fetchTransactionSummary(
  householdId: string,
  query: Partial<TransactionSummaryQuery> = {},
  options?: RequestOptions,
): Promise<TransactionSummaryResponse> {
  return request<TransactionSummaryResponse>(
    `${transactionsBase(householdId)}/summary${queryString({
      from: query.from,
      to: query.to,
      includeAggregates: query.includeAggregates,
    })}`,
    options,
  );
}

export function fetchTransaction(
  householdId: string,
  transactionId: string,
  options?: RequestOptions,
): Promise<TransactionResponse> {
  return request<TransactionResponse>(`${transactionsBase(householdId)}/${transactionId}`, options);
}

export function updateTransaction(
  householdId: string,
  transactionId: string,
  body: UpdateTransactionRequest,
  options?: RequestOptions,
): Promise<TransactionResponse> {
  return request<TransactionResponse>(`${transactionsBase(householdId)}/${transactionId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteTransaction(
  householdId: string,
  transactionId: string,
  mutationId?: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`${transactionsBase(householdId)}/${transactionId}${queryString({ mutationId })}`, {
    ...options,
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* categories, tags                                                          */
/* -------------------------------------------------------------------------- */

export function fetchCategories(
  householdId: string,
  includeHidden?: boolean,
  options?: RequestOptions,
): Promise<CategoryListResponse> {
  return request<CategoryListResponse>(
    `/api/households/${householdId}/categories${queryString({ includeHidden })}`,
    options,
  );
}

export function createCategory(
  householdId: string,
  body: CreateCategoryRequest,
  options?: RequestOptions,
): Promise<CategoryResponse> {
  return request<CategoryResponse>(`/api/households/${householdId}/categories`, {
    ...options,
    method: "POST",
    body,
  });
}

export function updateCategory(
  householdId: string,
  categoryId: string,
  body: UpdateCategoryRequest,
  options?: RequestOptions,
): Promise<CategoryResponse> {
  return request<CategoryResponse>(`/api/households/${householdId}/categories/${categoryId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteCategory(
  householdId: string,
  categoryId: string,
  reassignTo?: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(
    `/api/households/${householdId}/categories/${categoryId}${queryString({ reassignTo })}`,
    { ...options, method: "DELETE" },
  );
}

export function fetchTags(
  householdId: string,
  query: { q?: string; limit?: number } = {},
  options?: RequestOptions,
): Promise<TagListResponse> {
  return request<TagListResponse>(
    `/api/households/${householdId}/tags${queryString({ q: query.q, limit: query.limit })}`,
    options,
  );
}

export function updateTag(
  householdId: string,
  tagId: string,
  body: UpdateTagRequest,
  options?: RequestOptions,
): Promise<TagResponse> {
  return request<TagResponse>(`/api/households/${householdId}/tags/${tagId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteTag(householdId: string, tagId: string, options?: RequestOptions): Promise<void> {
  return request<void>(`/api/households/${householdId}/tags/${tagId}`, { ...options, method: "DELETE" });
}

/* -------------------------------------------------------------------------- */
/* fixed-cost plan                                                            */
/* -------------------------------------------------------------------------- */

function planBase(householdId: string): string {
  return `/api/households/${householdId}/plan`;
}

export function fetchPlan(householdId: string, options?: RequestOptions): Promise<PlanResponse> {
  return request<PlanResponse>(planBase(householdId), options);
}

export function updatePlan(
  householdId: string,
  body: { enabled?: boolean; payerId?: string; startPeriod?: string },
  options?: RequestOptions,
): Promise<PlanResponse> {
  return request<PlanResponse>(planBase(householdId), { ...options, method: "PATCH", body });
}

export function fetchPlanPreview(
  householdId: string,
  period: string,
  options?: RequestOptions,
): Promise<PlanComputationResponse> {
  return request<PlanComputationResponse>(
    `${planBase(householdId)}/preview${queryString({ period })}`,
    options,
  );
}

export function runPlan(
  householdId: string,
  body: RunPlanRequest = {},
  options?: RequestOptions,
): Promise<RunPlanResponse> {
  return request<RunPlanResponse>(`${planBase(householdId)}/run`, { ...options, method: "POST", body });
}

export function recalculatePlan(
  householdId: string,
  body: RecalculatePlanRequest,
  options?: RequestOptions,
): Promise<RecalculatePlanResponse> {
  return request<RecalculatePlanResponse>(`${planBase(householdId)}/recalculate`, {
    ...options,
    method: "POST",
    body,
  });
}

export function fetchPlanRuns(
  householdId: string,
  query: Partial<PaginationQuery> = {},
  options?: RequestOptions,
): Promise<AccrualRunListResponse> {
  return request<AccrualRunListResponse>(
    `${planBase(householdId)}/runs${queryString({ limit: query.limit, offset: query.offset })}`,
    options,
  );
}

export function createFixedCostItem(
  householdId: string,
  body: CreateFixedCostItemRequest,
  options?: RequestOptions,
): Promise<FixedCostItemResponse> {
  return request<FixedCostItemResponse>(`${planBase(householdId)}/items`, {
    ...options,
    method: "POST",
    body,
  });
}

export function updateFixedCostItem(
  householdId: string,
  itemId: string,
  body: UpdateFixedCostItemRequest,
  options?: RequestOptions,
): Promise<FixedCostItemResponse> {
  return request<FixedCostItemResponse>(`${planBase(householdId)}/items/${itemId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteFixedCostItem(
  householdId: string,
  itemId: string,
  options?: RequestOptions,
): Promise<void> {
  return request<void>(`${planBase(householdId)}/items/${itemId}`, { ...options, method: "DELETE" });
}

export function createIncome(
  householdId: string,
  body: CreateIncomeRequest,
  options?: RequestOptions,
): Promise<IncomeResponse> {
  return request<IncomeResponse>(`${planBase(householdId)}/incomes`, { ...options, method: "POST", body });
}

export function updateIncome(
  householdId: string,
  incomeId: string,
  body: UpdateIncomeRequest,
  options?: RequestOptions,
): Promise<IncomeResponse> {
  return request<IncomeResponse>(`${planBase(householdId)}/incomes/${incomeId}`, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function deleteIncome(householdId: string, incomeId: string, options?: RequestOptions): Promise<void> {
  return request<void>(`${planBase(householdId)}/incomes/${incomeId}`, { ...options, method: "DELETE" });
}

/* -------------------------------------------------------------------------- */
/* balance                                                                    */
/* -------------------------------------------------------------------------- */

export function fetchBalance(
  householdId: string,
  query: Partial<BalanceQuery> = {},
  options?: RequestOptions,
): Promise<BalanceResponse> {
  return request<BalanceResponse>(
    `/api/households/${householdId}/balance${queryString({ includeAggregates: query.includeAggregates })}`,
    options,
  );
}

export function fetchBalanceHistory(
  householdId: string,
  query: Partial<BalanceHistoryQuery> = {},
  options?: RequestOptions,
): Promise<BalanceHistoryResponse> {
  return request<BalanceHistoryResponse>(
    `/api/households/${householdId}/balance/history${queryString({
      from: query.from,
      to: query.to,
      includeAggregates: query.includeAggregates,
    })}`,
    options,
  );
}

/* -------------------------------------------------------------------------- */
/* settlements                                                                */
/* -------------------------------------------------------------------------- */

export function fetchSettlements(
  householdId: string,
  query: Partial<PaginationQuery> = {},
  options?: RequestOptions,
): Promise<TransactionListResponse> {
  return request<TransactionListResponse>(
    `/api/households/${householdId}/settlements${queryString({
      limit: query.limit,
      offset: query.offset,
    })}`,
    options,
  );
}

export function createSettlement(
  householdId: string,
  body: CreateSettlementRequest,
  options?: RequestOptions,
): Promise<SettlementResponse> {
  return request<SettlementResponse>(`/api/households/${householdId}/settlements`, {
    ...options,
    method: "POST",
    body,
  });
}

/* -------------------------------------------------------------------------- */
/* grouped facade (nice for autocomplete: api.transactions.list(...))         */
/* -------------------------------------------------------------------------- */

export const api = {
  health: fetchHealth,
  auth: {
    register: registerAccount,
    login: loginWithPassword,
    logout,
    me: fetchMe,
    updateProfile,
    changePassword,
    requestPasswordReset,
    resetPassword,
    sessions: fetchSessions,
    revokeSession,
  },
  households: {
    list: fetchHouseholds,
    create: createHousehold,
    detail: fetchHousehold,
    update: updateHousehold,
    members: fetchHouseholdMembers,
    updateMemberDisplayName,
    leave: leaveHousehold,
    invites: fetchHouseholdInvites,
    createInvite: createHouseholdInvite,
    revokeInvite: revokeHouseholdInvite,
    invitePreview: fetchInvitePreview,
    acceptInvite,
  },
  transactions: {
    list: fetchTransactions,
    create: createTransaction,
    summary: fetchTransactionSummary,
    detail: fetchTransaction,
    update: updateTransaction,
    remove: deleteTransaction,
  },
  categories: {
    list: fetchCategories,
    create: createCategory,
    update: updateCategory,
    remove: deleteCategory,
  },
  tags: {
    list: fetchTags,
    update: updateTag,
    remove: deleteTag,
  },
  plan: {
    fetch: fetchPlan,
    update: updatePlan,
    preview: fetchPlanPreview,
    run: runPlan,
    recalculate: recalculatePlan,
    runs: fetchPlanRuns,
    createItem: createFixedCostItem,
    updateItem: updateFixedCostItem,
    removeItem: deleteFixedCostItem,
    createIncome,
    updateIncome,
    removeIncome: deleteIncome,
  },
  balance: {
    fetch: fetchBalance,
    history: fetchBalanceHistory,
  },
  settlements: {
    list: fetchSettlements,
    create: createSettlement,
  },
} as const;
