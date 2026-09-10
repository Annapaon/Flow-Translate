# 流译助手（Flow Translate）隐私政策 / Privacy Policy

生效日期 / Effective date: 2026-09-10

Chrome 扩展产品 ID / Chrome extension ID: `amjogmonhgjbbndglcedgbgglcpncbjc`

## 中文

### 1. 产品用途

流译助手用于将用户主动选择、输入或明确启动全文翻译后的可读网页文字发送到用户自行配置的翻译服务，并展示译文。服务包括大模型及百度、Microsoft Translator、Google Cloud Translation、DeepL 官方 API。

### 2. 处理的数据

- 待翻译文本：仅在用户点击翻译、使用快捷键/右键菜单，或主动开启自动翻译后处理。全文翻译发送可读正文及最小行内格式，不发送整页 HTML、Cookie、隐藏内容或表单编辑值。
- 网站暂停/禁用规则和定向术语：仅保存在当前浏览器。命中的术语可能随大模型翻译请求发送。
- 页面标题和 URL：仅在用户开启“保存翻译历史”时保存在当前浏览器本地。
- API Key/Secret、App ID、Region、服务地址和自定义请求头：用于连接所选服务。API Key/Secret 可选择本地或会话保存；会话保存关闭浏览器后清除，内容脚本不能读取凭据。
- 翻译历史、缓存和按模型使用量：仅保存在当前浏览器本地。历史默认关闭；缓存保存期限为 7 天。

### 3. 数据传输

待翻译文本会直接从扩展发送至用户配置的翻译服务。扩展开发者不运营翻译代理服务器，也不会接收这些文本、API Key、浏览历史或翻译结果。模型服务商可能依据其自身隐私政策处理数据，用户应在使用前审阅相应条款。本地模型服务可在用户设备内完成处理。

### 4. 数据用途和限制

数据只用于提供用户请求的翻译、缓存、历史和本地使用量统计，不用于广告、画像、出售、数据经纪或与翻译无关的用途。开发者不会允许人工阅读用户数据。本扩展对信息的使用遵守 Chrome Web Store User Data Policy（包括 Limited Use 要求）。

### 5. 安全措施

云端模型地址必须使用 HTTPS；只有本机地址（localhost、127.0.0.1、::1）和局域网私有地址（如 192.168.*.*、10.*.*、172.16–172.31.*、169.254.*.* 或 *.local 主机名）可使用 HTTP。局域网 HTTP 地址在保存或测试时会单独请求访问权限。API Key 不会提供给网页内容脚本，错误信息会进行密钥脱敏。扩展不加载或执行远程代码。浏览器本地存储不是系统级密钥保险箱，请勿在不可信设备上保存重要密钥。

### 6. 用户控制与删除

用户可以暂停/恢复全文翻译、恢复原文、暂停或禁用当前网站，并随时关闭自动翻译、历史或缓存，撤回数据处理同意，删除单条或全部历史，并在“配置管理”中清除历史、缓存和使用量统计。卸载扩展会由浏览器删除扩展本地数据。模型服务商持有的数据需按对应服务商的政策申请删除。

### 7. 数据保留与共享

扩展开发者不收集或保留用户数据，因此不会向第三方出售或共享用户数据。用户主动配置的模型服务是完成翻译所必需的数据接收方。本地历史最多 100 条，全文不逐段写入普通历史；划词缓存最多 100 条，全文缓存约 10 MiB，缓存最长 7 天；API 配置保留到用户删除或卸载扩展。

### 8. 儿童与敏感信息

本扩展不面向儿童收集信息。请勿提交密码、支付信息、健康记录、身份号码或其他高度敏感信息。

### 9. 联系与变更

如需咨询隐私问题或申请协助删除数据，请联系开发者：`[CONTACT_EMAIL]`。政策更新将在本页面注明生效日期；重大变更将在扩展界面中告知。

## English

### 1. Purpose

Flow Translate sends selected or entered text, or readable page text after the user starts page translation, to the configured translation service and displays translations. Services include LLMs and official Baidu, Microsoft Translator, Google Cloud Translation and DeepL APIs.

### 2. Data processed

- Text to translate is processed only after a user action, or after the user explicitly enables automatic translation.
- Page title and URL are stored locally only when translation history is enabled.
- API keys/Secrets, App IDs, Regions, endpoints, and custom headers connect to the selected service. Keys/Secrets use local or session storage according to user settings; session keys are cleared when the browser closes. Content scripts cannot access credentials.
- History, cache, and per-model usage counters remain local. History is off by default; cache entries expire after seven days.

### 3. Data transmission

Translation text is sent directly from the extension to the translation service configured by the user. The extension developer operates no translation proxy and does not receive text, API keys, browsing history, or results. Model providers may process data under their own privacy policies. A local model can keep processing on the user's device.

### 4. Use and Limited Use

Data is used only for user-requested translation, local cache, local history, and local usage statistics. It is not used for advertising, profiling, sale, data brokering, or unrelated purposes. The developer does not permit humans to read user data. Use of information complies with the Chrome Web Store User Data Policy, including Limited Use requirements.

### 5. Security

Cloud endpoints must use HTTPS; HTTP is allowed only for loopback addresses (localhost, 127.0.0.1, ::1) and private LAN addresses (such as 192.168.*.*, 10.*.*, 172.16–172.31.*, 169.254.*.*, or *.local hostnames). Access to a LAN HTTP endpoint is requested separately when you save or test the profile. API keys are not exposed to webpage content scripts, errors are redacted, and no remotely hosted code is loaded or executed. Browser local storage is not a system secret vault; do not store important keys on an untrusted device.

### 6. User controls and deletion

Users can pause/resume page translation, restore originals, pause or disable a site, disable automatic translation, history, or cache; withdraw consent; delete history; and clear local history, cache, and usage statistics in Configuration Management. Uninstalling removes extension-local data through the browser. Requests concerning data retained by a model provider must be directed to that provider.

### 7. Retention and sharing

The developer does not collect, retain, sell, or share user data. A model service chosen by the user is the necessary recipient for translation. Local history and selection cache are limited to 100 entries each; page cache is limited to approximately 10 MiB. Caches expire after seven days, and API configuration remains until removed or the extension is uninstalled.

### 8. Children and sensitive information

The extension is not designed to collect children's information. Do not submit passwords, payment information, health records, government identifiers, or other highly sensitive information.

### 9. Contact and changes

For privacy questions or assistance with data deletion, contact the developer at `[CONTACT_EMAIL]`. Updates will change the effective date above; material changes will also be disclosed in the extension.

### 全文与网关补充说明 / Page translation and gateways

全文任务进行期间，新加载的可读内容可能增量发送。暂停停止新请求并中止未完成请求；此前已发送的数据仍可能由服务商处理或计费。恢复原文仅删除扩展插入的译文，不撤回服务商已经收到的数据。配置用户自行管理的网关时，正文与请求凭据会经过该网关；扩展不会自动选择或运营中转服务。

While page translation is active, newly loaded readable content may be translated incrementally. Pausing stops new work and aborts unfinished requests, but already sent text may still be processed or billed. Restoring originals removes inserted translations; it does not retract data already received by the provider. If a user configures their own compatible gateway, requests and credentials pass through that gateway. The extension does not choose a gateway automatically or operate one. Site rules and terms are stored locally; matching terms may be sent to the selected LLM. Whole-page blocks do not populate normal translation history.
