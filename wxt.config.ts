import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "流式划词翻译",
    description: "选中网页文本，使用你自己的大模型 API 进行流式翻译。",
    permissions: ["storage", "contextMenus"],
    host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
    commands: {
      "translate-selection": {
        suggested_key: { default: "Alt+T" },
        description: "翻译当前选中的文本"
      }
    },
    action: {
      default_title: "打开划词翻译设置"
    }
  }
});
