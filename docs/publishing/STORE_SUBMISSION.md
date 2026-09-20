# Chrome Web Store / Microsoft Edge Add-ons 提交材料

## 发布前必须替换

- ✅ 隐私政策中的 `[CONTACT_EMAIL]` 已替换为 annapaon@163.com。
- 将隐私政策发布到无需登录即可访问的 HTTPS URL，并填入所涉产品“隐私权”页的“隐私权政策网址”指定字段。仓库文件和产品说明中的链接不能替代此字段。
- 填写支持网站、支持邮箱和代码仓库 URL。
- 使用真实产品截图，不得包含真实 API Key、个人网页或敏感文本。

## 隐私政策发布

设置公开联系邮箱后运行：

```bash
PRIVACY_CONTACT_EMAIL='你的真实公开邮箱' npm run build:privacy
```

将 `.output/privacy-site/` 托管到无需登录的 HTTPS 网站，并把实际地址填入商店后台的隐私政策专用字段。提交前确认政策与实际版本一致；仓库中的模板不代表已完成公开托管。

## 单一用途 / Single purpose

中文：通过用户自行配置的翻译服务，翻译选中文字、网页正文及长文本，并在网页浮窗、原文下方或侧边栏显示结果。

English: Translate selected text, readable webpage content, and long text through a user-configured translation service, with results shown in an overlay, below the original content, or in a side panel.

## 简短说明

中文：使用自选的云端或本地翻译服务，翻译选中文字、网页正文和长文本。

English: Translate selected text, webpages, and long text with your own cloud or local translation service.

## 完整说明

流译助手支持点击圆点、快捷键、右键菜单和可选的自动翻译。用户可自行配置云端或本地的大模型 API 服务，包括各类兼容开放接口标准的推理服务，翻译请求直接发送到用户填写的服务地址。扩展支持多模型、场景提示词、Side Panel 长文本、纯文本流式结果、本地历史、缓存和按模型使用量统计。翻译数据直接发送到用户配置的服务，开发者不提供中转服务器。历史默认关闭。

Flow Translate supports a translation dot, keyboard shortcut, context menu, and optional automatic translation. Users can configure their own cloud or local LLM API service, including any inference service exposing a compatible open API standard; translation requests are sent directly to the endpoint the user provides. It includes multiple profiles, scene prompts, long-text Side Panel, plain-text streaming output, optional local history, cache, and per-model usage statistics. Translation data goes directly to the service configured by the user; the developer operates no proxy. History is off by default.

## 权限理由

| 权限 | 提交后台说明 |
|---|---|
| `activeTab` | 用户主动操作扩展时访问当前标签页，以启动翻译和查询页面状态。 |
| `storage` | 在用户设备本地保存设置、模型凭据、可选历史、缓存和使用量统计。API Key 不会提供给网页内容脚本。 |
| `contextMenus` | 提供用户主动触发的“翻译选中的文本”右键菜单。 |
| `sidePanel` | 提供长文本输入和流式翻译结果侧边栏。 |
| 网站内容访问 / `<all_urls>` | 检测用户在普通网页中主动选择的文本，并显示翻译圆点和结果浮窗。也用于用户主动启动或明确开启自动全文模式后的正文读取和双语展示；未同意数据处理说明或被网站规则禁用时不发起翻译。 |
| 可选 `https://*/*` | 连接用户自行配置的 HTTPS 模型 API。扩展仅在用户保存、测试或导入并启用模型配置时，为该 API 域名申请访问权限；不连接开发者控制的翻译服务器。 |
| 可选 `http://*/*` | 连接用户自行配置的局域网模型服务（如 192.168.*.*、10.*.*.*、172.16–172.31.*.*、169.254.*.*、*.local 的 HTTP 地址）。扩展仅在用户保存、测试或导入并启用模型配置时，为该地址申请访问权限；地址校验只放行本机和局域网范围，公网地址强制 HTTPS。 |
| localhost HTTP | 连接用户设备上的 Ollama、LM Studio、Xinference、vLLM 或 SGLang，允许 localhost/127.0.0.1/::1（静态权限）。 |

## 请求主机权限的理由

中文（可直接填写到商店审核表）：

流译助手允许用户接入自行选择的大模型 API（云端 HTTPS 服务或局域网内的本地推理服务），因此无法在发布时预先确定模型服务的地址。扩展仅在用户主动保存、测试或导入并启用模型配置时，请求该 API 地址（域名或局域网地址）的可选主机权限，并仅使用此权限从扩展后台向该模型服务发送用户主动提交的待翻译文本、接收翻译结果。该权限不会用于读取模型服务网站页面、跟踪浏览记录、投放广告或向开发者服务器传输数据。普通网页上的内容脚本用于划词浮窗，以及用户主动启动或明确开启自动全文模式后的正文读取和双语展示。

English (for store review forms):

Flow Translate lets users connect a language-model API of their choice (a cloud HTTPS service or a local inference service on their LAN), so the API endpoint cannot be predetermined at publication time. The extension requests optional host access to that specific API endpoint (domain or LAN address) only when the user saves, tests, or imports and enables a model profile. The permission is used solely by the extension background context to send user-submitted text to that model service and receive translation results. It is not used to read pages on the model provider's website, track browsing, serve ads, or transmit data to a developer-operated server. Content scripts support selection translation and bilingual page rendering. Readable page content is processed when the user starts page translation or explicitly enables automatic page translation.

## Chrome Privacy Practices 建议答案

- Personally identifiable information: No（除非未来加入账号）。
- Health information: No；产品明确提示用户不要提交。
- Financial and payment information: No；产品明确提示用户不要提交。
- Authentication information: Yes，用户提供的模型 API Key，仅本地保存并发送到用户选择的模型服务。
- Personal communications / User-generated content: Yes，用户主动选择或输入的待翻译文本。
- Website content: Yes，用户选择或输入的文字；也包括用户明确启动或主动开启自动全文翻译后的可读正文及最小行内格式，任务运行时可能处理新增正文。
- Web browsing activity: Yes，页面标题和 URL 仅在用户开启历史时本地保存。
- Data sold or used for ads/credit/lending: No。
- Human access: No。
- Remote code: No。
- Limited Use certification: Yes。

## Edge Partner Center

- Single purpose：使用上面的英文 Single purpose。
- Permission justification：使用权限表内容。
- Are you using remote code?：No。所有 JavaScript、React 和 Provider 逻辑均包含在提交包中；远程模型仅返回数据。
- Data usage：声明 Authentication information、Website content、Browsing activity、User-generated content；说明开发者不接收数据，第三方仅为用户选择的模型服务。
- Privacy policy URL：填写已公开托管的隐私政策 URL。

## 审核员测试步骤

1. 安装扩展并点击工具栏图标。
2. 阅读并接受数据处理说明。
3. 点击齿轮进入设置，在“模型服务”中新增测试模型；审核可使用自己的 API Key，或使用本地 OpenAI-compatible 测试服务。
4. 打开普通 HTTPS 网页，选择一段非敏感文字并点击紫色圆点。
5. 确认译文流式出现、取消选区后浮窗关闭。
6. 在工具栏点击“长文本”，确认 Side Panel 可以翻译粘贴文本。
7. 在设置中关闭历史、执行“清除本地翻译数据”，或执行“删除全部本地数据”，确认本地数据和 API Key 可由用户清除。

## 商店素材清单

- 128×128 商店图标：`src/public/icon/128.png`。
- 至少 1 张、建议 3–5 张真实功能截图：划词浮窗、工具栏参数、模型卡片、Side Panel、隐私控制。
- Chrome 推荐宣传图按开发者后台当期尺寸制作；不要拉伸图标充当截图。
- 中英文标题、说明和截图应保持功能一致。
