# 流译助手（Flow Translate）

一个基于 WXT、React 和 TypeScript 的 Chrome/Edge 浏览器扩展。支持划词和网页全文双语翻译，可使用自定义大模型或官方机器翻译 API。大模型结果支持流式显示。

插件使用紫蓝双向对话气泡图标，在浏览器工具栏和扩展管理页面提供统一识别。

## 当前功能

- 双向互译：设置页开启后选择“中文 ↔ 外语”，关闭后恢复原语向；浮窗支持临时切换方向。
- 网页全文双语翻译：使用 `Alt+Q` 或 Popup 大号翻译按钮，译文放在对应原文下方；支持暂停、继续、恢复原文和失败段落重试。
- 百度、Microsoft/必应、Google Cloud Translation v2、DeepL 官方翻译 API；需要自行配置相应开发者凭据，个人翻译软件订阅不等同于 API 账户。
- 智能输出、少量定向术语、重新翻译及网站会话暂停/永久禁用。

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

## 项目目录

```text
src/                 扩展业务源码
  entrypoints/       后台、内容脚本、弹窗、设置页和侧边栏入口
  content/           网页全文翻译的 DOM 与任务控制
  core/              翻译调度、语言判断及服务适配
  shared/            共享设置、存储、权限、类型与界面组件
  public/            随扩展发布的静态图标
tests/               测试（unit/ 单元测试，e2e/ 浏览器测试）
docs/                文档、发布记录和设计素材
scripts/             构建辅助脚本
```

文档按 `plans/`、`releases/`、`reviews/`、`publishing/` 分类，见 [文档导航](docs/README.md)。工具配置保留在根目录，便于 WXT、TypeScript、ESLint 等工具自动发现。

## 安装开发版本

```bash
npm ci
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

发布材料见 [隐私政策](docs/publishing/PRIVACY_POLICY.md) 和 [商店提交材料](docs/publishing/STORE_SUBMISSION.md)。使用 `PRIVACY_CONTACT_EMAIL='你的真实公开邮箱' npm run build:privacy` 生成 `.output/privacy-site/index.html`，将其托管到公开 HTTPS 地址，再把该地址填入 Chrome 商店后台本产品“隐私权”页的“隐私权政策网址”专用字段。产品说明中的链接不能代替此字段；Purple Nickel 退回的完整处理步骤见商店提交材料。

## 规划

完整规划见 [docs/plans/TRANSLATION_EXTENSION_PLAN.md](docs/plans/TRANSLATION_EXTENSION_PLAN.md)。

功能设计见 [双向互译、网页全文翻译与翻译服务接入方案](docs/plans/NEXT_PHASE_IMPLEMENTATION_PLAN.md)；本轮实现、兼容决策和待联调事项见 [1.3.0 开发交付记录](docs/releases/RELEASE_NOTES_1.3.0.md)。

## 自动化验证

```bash
npm run typecheck
npm test
npx playwright install chromium  # 首次运行时安装测试浏览器
npm run test:e2e
```

`npm run check` 依次执行 ESLint 检查、类型检查、单元测试、生产构建和端到端测试。

仓库提交规则、开发环境和格式化约定见 [工程维护说明](docs/DEVELOPMENT.md)。
端到端测试加载 `.output/chrome-mv3` 中的真实扩展，使用临时浏览器配置和本地 SSE 模型服务，不需要真实 API Key，也不会调用云端模型。覆盖段落、跨节点、input/textarea 选区、流式输出、自动翻译稳定性、请求取消和明暗主题。失败截图保存在 `test-results/`。

一期实现使用 React 状态、原生 CSS 和 Zod 导入校验；未使用的 Zustand、React Hook Form、Tailwind 依赖已移除。整合核对记录见 [一期核对报告](docs/reviews/PHASE1_REVIEW.md)。

## 新功能使用

在设置页“翻译配置”开启双向互译并选择外语。原来的源/目标语言会禁用但保留，关闭开关后恢复。短词判断不确定时可用结果区“切换方向”纠正。

在“翻译服务配置”添加服务：百度填写 App ID 和 Secret（API Key 字段）；Microsoft 填写 Key 与资源需要的 Region；Google 填写 Cloud Translation v2 API Key；DeepL 填写 API Key 并选择 Free/Pro。保存时按域名授予访问权限，连接测试会实际调用服务。

在普通网页使用 `Alt+Q` 或打开 Popup 点击大号翻译按钮。目标语言跟随当前翻译规则；全文任务固定一个目标语言，已是目标语言的块会跳过。长页面达到预算后暂停，点击继续可处理剩余内容。“恢复原文”结束任务并移除扩展译文，保留原网页节点与交互状态。

全文翻译会将可读网页文本及最小行内格式发送至所选服务，表单输入、隐藏文本及编辑区不参与。PDF、跨域 iframe、封闭 Shadow DOM 暂不支持。复杂布局可能跳过或降级；真实服务连通性与计费以账户实际情况为准。

### 全文翻译

工具栏与设置页均可开启或关闭全文翻译，默认通过 `Alt+Q` 触发，也可点击弹窗中的大号翻译按钮启动并收起面板；点击“修改快捷键”进入浏览器的扩展快捷键设置。选择自动模式后，进入符合网站规则的页面时自动翻译。译文显示在原文下方的浅色圆角框中，使用量统一计入实际使用的模型卡片。详细行为见 [1.3.1 更新说明](docs/releases/RELEASE_NOTES_1.3.1.md)。

模型测试反馈位置及快捷键调整见 [1.3.2 更新说明](docs/releases/RELEASE_NOTES_1.3.2.md)。

### 1.3.3 翻译性能

在“设置 → 模型服务 → 点击模型卡片 → 高级设置”调整最大并发请求数，默认 2，范围 1–6。划词、长文本、全文翻译和连接测试共用该模型配置的上限；划词与交互请求优先排队，遇到限流自动降低并发并退避。百度保留单并发和请求间隔保护。

全文翻译优先处理可视区域，自动合并短段落，流式显示收到的译文。批量格式不兼容时，本次页面会话自动退回单段请求；缓存仍按段落保存。详见 [1.3.3 更新说明](docs/releases/RELEASE_NOTES_1.3.3.md)。

### 1.3.5 按功能分配模型

设置 → 模型服务中新增“按功能分别设置模型”开关，默认关闭，所有翻译使用当前默认模型。开启后可为划词、全文和长文本分别选择已启用的服务，或保留“跟随默认模型”。关闭开关保留绑定记录；再次开启恢复选择。正在运行的全文任务保留启动时的模型，修改绑定对后续任务生效。详见 [1.3.5 更新说明](docs/releases/RELEASE_NOTES_1.3.5.md)。

### 1.3.6 导入并启用

设置 → 配置管理中选择文件后，点击“导入并启用”，统一申请已启用模型所需的接口权限，成功后即可按配置使用。保存、测试和导入不再额外弹出插件自己的授权确认框，仅保留必要的浏览器权限提示。拒绝授权不覆盖配置；本机已有的数据处理同意会保留，首次使用可在导入区域确认。详见 [1.3.6 更新说明](docs/releases/RELEASE_NOTES_1.3.6.md)。
