import { afterEach, expect, it, vi } from "vitest";
import { apiOrigins, requestApiPermissions } from "../../src/shared/api-permissions";
afterEach(() => vi.restoreAllMocks());
it("deduplicates exact hosts, strips paths and ports and validates endpoints", () => {
  expect(apiOrigins(["https://api.example.com/v1", "https://api.example.com:8443/v2", "http://192.168.1.2:8000/v1"])).toEqual(["https://api.example.com/*", "http://192.168.1.2/*"]);
  expect(() => apiOrigins(["http://public.example.com"])).toThrow();
});
it("requests all origins synchronously without an application confirmation or intervening await", async () => {
  const request = vi.spyOn(browser.permissions, "request").mockResolvedValue(true);
  const result = requestApiPermissions(["https://a.example.com/v1", "https://b.example.com/v1"]);
  expect(request).toHaveBeenCalledWith({ origins: ["https://a.example.com/*", "https://b.example.com/*"] });
  expect(await result).toBe(true);
});
it("skips only statically granted HTTP loopback endpoints", async () => {
  const request = vi.spyOn(browser.permissions, "request").mockResolvedValue(true);
  await requestApiPermissions(["http://localhost:8000/v1", "http://127.0.0.1:9000/v1", "http://[::1]:8000"]);
  expect(request).not.toHaveBeenCalled();
  await requestApiPermissions(["https://localhost/v1", "http://127.0.0.2/v1"]);
  expect(request).toHaveBeenCalledWith({ origins: ["https://localhost/*", "http://127.0.0.2/*"] });
});
it("propagates denial and browser request failures", async () => {
  const request = vi.spyOn(browser.permissions, "request").mockResolvedValue(false);
  expect(await requestApiPermissions(["https://example.com"])).toBe(false);
  request.mockRejectedValue(new Error("browser failure"));
  await expect(requestApiPermissions(["https://example.com"])).rejects.toThrow("browser failure");
});
