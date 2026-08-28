# Chrome Web Store / Microsoft Edge Add-ons 提交材料

## 发布前必须替换

- 隐私政策中的 `[CONTACT_EMAIL]`。
- 将 `docs/PRIVACY_POLICY.md` 发布到无需登录即可访问的 HTTPS URL。
- 填写支持网站、支持邮箱和代码仓库 URL。
- 使用真实产品截图，不得包含真实 API Key、个人网页或敏感文本。

## 单一用途 / Single purpose

中文：让用户通过自选的大模型服务翻译其主动选择或输入的文本，并在网页浮窗或侧边栏中流式显示结果。

English: Translate text actively selected or entered by the user through a user-configured model service and stream the result in a webpage overlay or side panel.

## 简短说明

中文：选择网页文字或粘贴长文本，使用你自己的云端或本地大模型进行安全、流式翻译。

English: Translate selected webpage text or pasted long text with your own cloud or local language model, with streaming output.

## 完整说明

流译助手支持点击圆点、快捷键、右键菜单和可选的自动翻译。用户可配置 OpenAI-compatible、Anthropic-compatible、Gemini、Ollama、LM Studio、Xinference、vLLM 或 SGLang 服务。扩展支持多模型、场景提示词、Side Panel 长文本、纯文本流式结果、本地历史、缓存和按模型使用量统计。翻译数据直接发送到用户配置的服务，开发者不提供中转服务器。历史默认关闭。

Flow Translate supports a translation dot, keyboard shortcut, context menu, and optional automatic translation. Users can configure OpenAI-compatible, Anthropic-compatible, Gemini, Ollama, LM Studio, Xinference, vLLM, or SGLang services. It includes multiple profiles, scene prompts, long-text Side Panel, plain-text streaming output, optional local history, cache, and per-model usage statistics. Translation data goes directly to the service configured by the user; the developer operates no proxy. History is off by default.

## 权限理由

| 权限 | 提交后台说明 |
|---|---|
| `storage` | 在用户设备本地保存设置、模型凭据、可选历史、缓存和使用量统计。API Key 不会提供给网页内容脚本。 |
| `contextMenus` | 提供用户主动触发的“翻译选中的文本”右键菜单。 |
| `sidePanel` | 提供长文本输入和流式翻译结果侧边栏。 |
| 网站内容访问 / `<all_urls>` | 检测用户在普通网页中主动选择的文本，并显示翻译圆点和结果浮窗。未同意数据处理说明或被网站规则禁用时不会读取或发送选区。 |
| 可选 `https://*/*` | 连接用户自行配置的 HTTPS 模型 API。扩展仅在用户保存或测试模型配置时，为该 API 域名申请访问权限；不连接开发者控制的翻译服务器。 |
| localhost HTTP | 连接用户设备上的 Ollama、LM Studio、Xinference、vLLM 或 SGLang，仅允许 localhost/127.0.0.1/::1。 |

## Chrome Privacy Practices 建议答案

- Personally identifiable information: No（除非未来加入账号）。
- Health information: No；产品明确提示用户不要提交。
- Financial and payment information: No；产品明确提示用户不要提交。
- Authentication information: Yes，用户提供的模型 API Key，仅本地保存并发送到用户选择的模型服务。
- Personal communications / User-generated content: Yes，用户主动选择或输入的待翻译文本。
- Website content: Yes，仅用户选择的文字。
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

- 128×128 商店图标：`public/icon/128.png`。
- 至少 1 张、建议 3–5 张真实功能截图：划词浮窗、工具栏参数、模型卡片、Side Panel、隐私控制。
- Chrome 推荐宣传图按开发者后台当期尺寸制作；不要拉伸图标充当截图。
- 中英文标题、说明和截图应保持功能一致。
