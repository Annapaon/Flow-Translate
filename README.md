# 流译助手（Flow Translate）

一个基于 WXT、React 和 TypeScript 的 Chrome/Edge 浏览器扩展。选择网页文字后，可以点击圆点或自动调用自定义的 OpenAI-compatible API 进行流式翻译。

插件使用紫蓝双向对话气泡图标，在浏览器工具栏和扩展管理页面提供统一识别。

## 当前功能

- 普通网页及输入框划词检测。
- 点击小圆点或自动翻译；取消选区时同步关闭浮窗。
- 页面内 Shadow DOM 翻译浮窗。
- 原文、思考过程和译文分区显示，思考过程默认关闭并在结束时自动收起。
- OpenAI-compatible Chat Completions、Anthropic-compatible Messages 和 Gemini 原生流式接口。
- Ollama 和 LM Studio 本地模型预设，本地服务允许不配置 API Key。
- Xinference、vLLM 和 SGLang 本地推理服务预设。
- 支持局域网内其他服务器部署的模型（私有网段、链路本地和 `.local` 主机名的 HTTP 地址），保存或测试时按地址申请访问权限。
- 网络中断、限流或服务端错误时自动重试，并显示重新连接状态。
- 自定义 API Base URL、API Key、模型、目标语言和 Prompt。
- 支持配置多个模型，并从工具栏 Popup 快速切换模型和目标语言。
- 模型服务以卡片展示，可单独启停并通过弹窗编辑。
- 按模型统计成功请求数、输入字符数和输出字符数，并支持单独清零。
- 支持源语言、输出模式，以及可分别编辑提示词的通用/技术/学术/商务场景。
- 插件弹窗可快速选择当前使用的提示词场景。
- Side Panel 长文本翻译，可在工具栏弹窗中直接打开。
- 简体中文与 English 界面切换。
- Side Panel 单次最多可输入 100,000 个字符。
- 提示词模板支持变量占位符、复制、自定义状态和恢复默认。
- 支持模型级最大输出 Token 和自定义请求头。
- 使用纯文本展示译文，页面滚动和缩放时自动更新浮层位置。
- 支持网站黑名单和仅在指定网站启用的白名单模式。
- 原文、译文独立复制，以及取消、快捷键和右键菜单。
- 翻译完成后可编辑译文，并复制修改后的结果。
- 独立设置页，包含基本信息和大模型服务配置。
- 所有设置修改后自动保存，无需手动提交整页配置。
- 支持包含模型服务和提示词的完整配置导入、导出。
- 最近 100 条本地翻译历史，支持原译文对照、搜索、收藏、复制、单条删除和清空。
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
- 局域网内的服务（例如部署在另一台机器上的 Ollama）：`http://192.168.1.50:11434/v1`，也可以是 `http://nas.local:11434/v1` 等局域网地址
- Anthropic 兼容接口（官方默认）：`https://api.anthropic.com/v1`
- 火山方舟 Coding Plan（Anthropic 兼容）：`https://ark.cn-beijing.volces.com/api/coding`，模型可填写 `ark-code-latest`
- Gemini：`https://generativelanguage.googleapis.com/v1beta`

OpenAI 兼容服务使用 `POST /chat/completions`；Anthropic 兼容服务接受 SDK 风格 Base URL并请求 `/v1/messages`，也可填写以 `/v1` 或 `/messages` 结尾的地址；Gemini 使用对应的原生服务类型。

## 安全说明

API Key 保存在扩展本地存储，只能由扩展页面和后台读取，不会提供给网页内容脚本。翻译内容直接发送到用户配置的模型服务，开发者不提供中转服务器。历史默认关闭；配置导出默认排除 API Key 和自定义请求头。浏览器本地存储并非系统级密钥保险箱，请勿在不可信设备上保存重要密钥。

云端模型地址必须使用 HTTPS；HTTP 仅支持本机回环地址（localhost、127.0.0.1、::1）和局域网地址（如 192.168.*.*、10.*.*、172.16–172.31.*、169.254.*.*、`*.local` 主机名），公网明文 HTTP 会被拒绝。配置局域网 HTTP 地址时，扩展会在保存或测试时请求该地址的访问权限，请确认你信任所在的局域网。

发布材料见 [隐私政策](./docs/PRIVACY_POLICY.md) 和 [商店提交材料](./docs/STORE_SUBMISSION.md)。正式发布前必须替换隐私政策中的联系邮箱并将政策托管到公开 HTTPS 地址。

## 规划

完整规划见 [TRANSLATION_EXTENSION_PLAN.md](./TRANSLATION_EXTENSION_PLAN.md)。
