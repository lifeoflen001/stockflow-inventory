import axios, { AxiosError } from "axios";
import type { ApiErrorBody } from "@/types/api.ts";
import { toast as systemToast } from "@/lib/system-message.ts";

const configuredApiUrl = String(import.meta.env.VITE_API_URL ?? "").trim();
const isLoopbackApi = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(configuredApiUrl);
const browserIsOnLan = typeof window !== "undefined" && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const apiBaseUrl = isLoopbackApi && browserIsOnLan
  ? "/api/v1"
  : configuredApiUrl || "/api/v1";

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Let the browser add the multipart boundary for file uploads. Keeping the
  // JSON default header would make PHP treat FormData file fields as strings.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  const method = String(config.method ?? "get").toLowerCase();
  const url = String(config.url ?? "");
  if (method !== "get" && !url.includes("/auth/")) systemToast.loading("Processing request...");
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const method = String(response.config.method ?? "get").toLowerCase();
    const url = String(response.config.url ?? "");
    if (method !== "get" && !url.includes("/auth/")) systemToast.dismiss();
    return response;
  },
  (error: AxiosError<ApiErrorBody>) => {
    const method = String(error.config?.method ?? "get").toLowerCase();
    const url = String(error.config?.url ?? "");
    if (method !== "get" && !url.includes("/auth/")) systemToast.dismiss();
    if (error.response?.status === 401 && !error.config?.url?.endsWith("/auth/login")) {
      localStorage.removeItem("auth_token");
      window.dispatchEvent(new Event("stockflow:unauthorized"));
    }
    if (error.response?.data?.message) error.message = error.response.data.message;
    return Promise.reject(error);
  },
);

export function getApiErrorMessage(cause: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError<ApiErrorBody>(cause)) {
    const validationValue = Object.values(cause.response?.data?.errors ?? {}).flat()[0] as unknown;
    const validationMessage = typeof validationValue === "string" ? validationValue : validationValue && typeof validationValue === "object" && "errors" in validationValue ? `Row ${"row" in validationValue ? String(validationValue.row) : ""}: ${String((validationValue as { errors?: unknown[] }).errors?.[0] ?? "Invalid data")}` : undefined;
    return validationMessage ?? cause.response?.data?.message ?? (cause.code === "ERR_NETWORK" ? "The server is unavailable. Check that the API is running." : fallback);
  }
  return cause instanceof Error ? cause.message : fallback;
}
