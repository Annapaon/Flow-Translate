import { defineConfig } from "wxt";

export default defineConfig({
  manifestVersion: 3,
  zip: { zipSources: false },
  srcDir: "src",
  publicDir: "src/public",
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "流译助手",
    description:
      "支持划词、网页全文和长文本翻译，可连接自定义大模型或机器翻译服务。",
    permissions: [
      "activeTab",
      "storage",
      "contextMenus",
      ...(browser === "firefox"
        ? ["clipboardWrite" as const]
        : ["sidePanel" as const])
    ],
    host_permissions: [
      "http://localhost/*",
      "http://127.0.0.1/*",
      "http://[::1]/*"
    ],
    // https endpoints and LAN http endpoints are granted per-origin at
    // runtime when the user saves, tests, or imports model profiles.
    optional_host_permissions: ["https://*/*", "http://*/*"],
    commands: {
      "translate-page": {
        suggested_key: { default: "Alt+Q" },
        description: "翻译当前网页全文"
      }
    },
    action: {
      default_title: "打开流译助手",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "128": "icon/128.png"
      }
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png"
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "flow-translate@annapaon.github.io",
              strict_min_version: "140.0",
              data_collection_permissions: {
                required: ["authenticationInfo", "websiteContent"]
              }
            }
          }
        }
      : { minimum_chrome_version: "116" }),
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }
  })
});
