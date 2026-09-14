import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  publicDir: "src/public",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "流译助手",
    description: "选中网页文本，使用你自己的大模型 API 进行流式翻译。",
    permissions: ["activeTab", "storage", "contextMenus", "sidePanel"],
    host_permissions: ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"],
    // https endpoints and LAN http endpoints are granted per-origin at
    // runtime when the user saves, tests, or imports model profiles.
    optional_host_permissions: ["https://*/*", "http://*/*"],
    commands: {
      "translate-page": {
        suggested_key: { default: "Alt+Q" },
        description: "翻译当前网页全文"
      },
      "translate-selection": {
        suggested_key: { default: "Alt+T" },
        description: "翻译当前选中的文本"
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
    side_panel: { default_path: "sidepanel.html" },
    minimum_chrome_version: "116",
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }
  }
});
