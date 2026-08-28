# 流式划词翻译

一个基于 WXT、React 和 TypeScript 的 Chrome/Edge 浏览器扩展。选择网页文字后，可以点击圆点或自动调用自定义的 OpenAI-compatible API 进行流式翻译。

## 当前功能

- 普通网页及输入框划词检测。
- 点击小圆点或自动翻译；取消选区时同步关闭浮窗。
- 页面内 Shadow DOM 翻译浮窗。
- 原文、思考过程和译文分区显示，思考过程默认关闭并在结束时自动收起。
- OpenAI-compatible Chat Completions 流式接口。
- 自定义 API Base URL、API Key、模型、目标语言和 Prompt。
- 支持配置多个模型，并从工具栏 Popup 快速切换模型和目标语言。
- 模型服务以卡片展示，可单独启停并通过弹窗编辑。
- 原文、译文独立复制，以及重试、取消、快捷键和右键菜单。
- 独立设置页，包含基本信息和大模型服务配置。
- 最近 100 条本地翻译历史及一键清理。
- 7 天翻译缓存，相同请求可以直接复用。
- 网站黑名单，可对指定域名及其子域名禁用划词翻译。

## 安装开发版本

```bash
npm install
npm run build
```

然后在 Chrome 或 Edge 中：

1. 打开扩展管理页面（Chrome 为 `chrome://extensions`，Edge 为 `edge://extensions`）。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目下的 `.output/chrome-mv3` 目录。
5. 首次点击扩展图标，再点击右下角齿轮进入设置页配置模型。
6. 后续点击扩展图标可以快速切换目标语言和翻译模型。
7. 刷新需要翻译的网页，然后选择文字。

开发模式运行：

```bash
npm run dev
```

## API 地址示例

- OpenAI：`https://api.openai.com/v1`
- DeepSeek：`https://api.deepseek.com/v1`
- Ollama：`http://localhost:11434/v1`
- LM Studio：`http://localhost:1234/v1`

API 必须兼容 `POST /chat/completions` 及 SSE 流式响应。

## 安全说明

API Key 当前保存在 `chrome.storage.local`。它不会由本扩展发送到所配置模型服务之外的服务器，但浏览器本地存储并非系统级密钥保险箱。请勿在不可信设备上保存重要密钥。

## 规划

完整规划见 [TRANSLATION_EXTENSION_PLAN.md](./TRANSLATION_EXTENSION_PLAN.md)。
