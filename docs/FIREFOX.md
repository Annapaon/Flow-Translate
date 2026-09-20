# Firefox 安装与开发

支持 Firefox **桌面版 140 及以上版本**，当前扩展版本为 **1.0.0**。Android 不在本次验证范围内。

## 安装未签名开发包

1. 在 [v1.0.0 Release](https://github.com/Annapaon/Flow-Translate/releases/tag/v1.0.0) 下载 `flow-translate-1.0.0-firefox-unsigned.zip`，解压到固定目录。
2. 在 Firefox 地址栏打开 `about:debugging#/runtime/this-firefox`。
3. 点击“临时载入附加组件”，选择解压目录中的 `manifest.json`。
4. 点击工具栏扩展图标，确认数据处理说明并配置自己的翻译服务。点击“长文本”打开 Firefox 侧边栏。

这是**未经过 Mozilla 签名的开发包**，不能通过普通安装流程永久安装；关闭并重新启动 Firefox 后，需要再次临时加载。不要将 ZIP 改名为 XPI 来尝试绕过签名。正式分发需要由维护者另行提交 Mozilla 审核与签名。本次没有提交到 Mozilla 商店。

核对附件旁的 `.sha256` 文件即可验证下载完整性；校验值不是 Mozilla 签名。官方说明：[临时安装](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)、[签名与分发](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)。

## 使用差异

- 长文本在 Firefox 侧边栏打开，划词与全文翻译保持相同操作方式。
- 默认全文快捷键为 `Alt+Q`。需要修改时，打开 `about:addons`，在齿轮菜单中选择“管理扩展快捷键”；Firefox 不允许扩展直接打开该管理页。
- Firefox 的必需数据传输声明包括认证信息和网页内容；翻译内容直接发送到用户配置的服务。应用内的数据处理确认仍保留。
- Firefox 不支持 Chromium 的本地存储访问级别设置，因此私有配置保存在扩展自身的 IndexedDB。内容脚本使用网页自身的存储源，无法读取该私有配置；会话模式的 API Key 使用 Firefox `storage.session`。
- Firefox 对附加组件商店、浏览器内部页等页面的脚本限制仍适用；如撤销网站访问权限，需要在 Firefox 的扩展权限设置中重新允许后才能翻译。

## 构建与验证

```bash
npm ci
npm run typecheck
npm test
npm run zip:firefox
npx --yes web-ext@10.6.0 lint --source-dir .output/firefox-mv3
```

输出为 `.output/flow-translate-1.0.0-firefox-unsigned.zip` 及同名 `.sha256` 文件。构建命令只生成开发包，不申请签名。

Firefox 冒烟测试使用 Python 3 标准库和 geckodriver，不调用外部翻译服务：

```bash
FIREFOX_BINARY=/absolute/path/to/firefox \
GECKODRIVER=/absolute/path/to/geckodriver \
python3 tests/firefox/smoke.py
```

使用带 `--allow-system-access` 支持的 geckodriver 和 Firefox 140+；测试创建临时浏览器配置，安装开发包，检查设置页、后台通信、密钥隔离、侧边栏、长文本、划词、网页全文和 SPA 路由变化。测试结束后清理浏览器会话。

`.github/workflows/publish-firefox.yml` 从对应提交构建并上传 Firefox 附件，正文附上源码提交链接。Release 的原有 Chrome 安装包与 `v1.0.0` 标签保持不变；Firefox 适配源码以该提交链接为准。
