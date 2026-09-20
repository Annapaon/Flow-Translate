import type { TestConnectionResponse } from "../../shared/types";

export type DiagnosticCode =
  | "configuration"
  | "permission"
  | "authentication"
  | "forbidden"
  | "parameters"
  | "rate_limit"
  | "quota"
  | "timeout"
  | "network"
  | "server"
  | "empty"
  | "unknown";
export function diagnostic(
  code: DiagnosticCode,
  english = false,
  retryAfter = 0
): TestConnectionResponse {
  const messages: Record<DiagnosticCode, [string, string]> = {
    configuration: [
      "配置不完整或地址无效。请检查接口地址、密钥、模型名及服务必填参数。",
      "Configuration is incomplete or invalid. Check the endpoint, key, model and required service parameters."
    ],
    permission: [
      "未获得接口访问权限。请在此卡片保存或测试时允许浏览器授权。",
      "Endpoint permission is missing. Allow browser access when saving or testing this service."
    ],
    authentication: [
      "服务认证失败。请检查 API Key、App ID 或签名配置。",
      "Authentication failed. Check the API key, App ID or signing settings."
    ],
    forbidden: [
      "服务拒绝访问。请检查资源权限、区域设置及账户限制；不一定是密钥错误。",
      "Access was denied. Check resource permissions, region and account restrictions; the key may still be valid."
    ],
    parameters: [
      "服务不支持当前请求参数。请检查模型名称、语言或接口路径。",
      "Request parameters were rejected. Check the model, languages or endpoint path."
    ],
    rate_limit: [
      "请求受到限流。请稍后重试或降低此服务并发数。",
      "Rate limited. Retry later or lower this service's concurrency."
    ],
    quota: [
      "服务额度不足。请在服务商后台检查可用额度或计费状态。",
      "Service quota is exhausted. Check quota or billing with the provider."
    ],
    timeout: [
      "连接超时。请检查服务是否运行、网络及地址端口，稍后重试。",
      "Connection timed out. Check that the service is running, connectivity and endpoint port, then retry."
    ],
    network: [
      "网络连接失败。可检查网络、代理或证书；浏览器未提供确切原因。",
      "Network connection failed. Check connectivity, proxy or certificates; the browser did not provide an exact cause."
    ],
    server: [
      "服务暂时异常。请稍后重试或查看服务商状态。",
      "The service is temporarily unavailable. Retry later or check the provider status."
    ],
    empty: [
      "连接成功，但服务没有返回文本。请检查所选模型是否支持文本输出。",
      "Connected, but no text was returned. Check whether the selected model supports text output."
    ],
    unknown: [
      "连接测试失败。请检查服务配置或在服务商后台查看请求状态。",
      "Connection test failed. Check the configuration or request status with your provider."
    ]
  };
  return {
    ok: false,
    code,
    retryAfter,
    message:
      messages[code][english ? 1 : 0] +
      (retryAfter > 0
        ? english
          ? ` Retry after ${Math.ceil(retryAfter / 1000)}s.`
          : ` 建议等待 ${Math.ceil(retryAfter / 1000)} 秒。`
        : "")
  };
}
/** Canonical Baidu error-code classification, shared by the connection test
 *  (diagnose) and the translation path (machine.ts) so both classify new
 *  codes identically. 54005 ("长query请求频繁") stays in the rate-limit family. */
const BAIDU_CODES: Record<string, DiagnosticCode> = {
  "52001": "timeout",
  "52002": "server",
  "52003": "authentication",
  "54001": "authentication",
  "54003": "rate_limit",
  "54005": "rate_limit",
  "54004": "quota",
};
export function baiduDiagnosticCode(code: string): DiagnosticCode | undefined {
  return BAIDU_CODES[code.replace(/[^0-9]/g, "").slice(0, 10)];
}
export function diagnose(
  error: unknown,
  english = false,
  timeout = false
): TestConnectionResponse {
  const e = error as
    | {
        status?: number;
        code?: string;
        retryAfter?: number;
        name?: string;
        message?: string;
      }
    | undefined;
  const code = e?.code;
  const baidu = baiduDiagnosticCode(code ?? "");
  let kind: DiagnosticCode = "unknown";
  if (
    timeout ||
    e?.name === "TimeoutError" ||
    e?.name === "AbortError" ||
    e?.message === "timeout"
  )
    kind = "timeout";
  else if (baidu) kind = baidu;
  else if (code === "insufficient_quota" || code === "quota_exceeded") kind = "quota";
  else if (e?.status === 401) kind = "authentication";
  else if (e?.status === 429) kind = "rate_limit";
  else if (e?.status === 403) kind = "forbidden";
  else if ([400, 404, 422].includes(e?.status ?? 0)) kind = "parameters";
  else if (e?.status === 408) kind = "timeout";
  else if ((e?.status ?? 0) >= 500) kind = "server";
  else if (error instanceof TypeError) kind = "network";
  // Server bodies stay hidden here by design (see the security tests): the
  // bucket message plus code is all the connection-test UI reveals.
  return diagnostic(kind, english, e?.retryAfter);
}
