# 流译助手（Flow Translate）

<p align="center">
  <img src="src/public/icon/128.png" width="96" height="96" alt="流译助手图标">
</p>

流译助手是一款使用 WXT、React 和 TypeScript 开发的 Chrome/Edge/Firefox 翻译扩展。它支持划词翻译、网页全文双语翻译和长文本翻译，并允许不同功能使用不同的翻译服务。

当前公开版本：**1.0.0**。

## 主要功能

- 划词翻译：点击选区旁的圆点开始翻译，可配置双向互译、语言和提示词风格。
- 全文翻译：在原文下方插入浅色译文块，支持 `Alt+Q`、自动翻译、暂停、继续、区域翻译和恢复原文。
- 长文本翻译：通过浏览器侧边栏翻译长文本，支持流式输出。
- 独立服务绑定：划词、全文和长文本可分别选择已配置的服务。
- 大模型服务：OpenAI 兼容接口、Anthropic 兼容接口、Gemini、Ollama、LM Studio、Xinference、vLLM 和 SGLang。
- 机器翻译服务：百度翻译、必应翻译和 Google Cloud Translation v2，需要用户自行提供相应凭据。
- 提示词管理：新增、编辑、删除翻译风格，也可以使用已配置的大模型生成提示词。
- 本地数据：可选翻译历史、7 天缓存、服务用量统计、配置导入和安全导出。

本项目不提供公共翻译中转服务。翻译内容会直接发送到用户选择的服务。

## 安装开发版本

需要 Node.js 24 和 npm。

```bash
npm ci
npm run build
```

然后打开 `chrome://extensions` 或 `edge://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，加载 `.output/chrome-mv3`。

Firefox 桌面版 140+ 使用 `npm run zip:firefox` 构建；Release 中的 `flow-translate-1.0.0-firefox-unsigned.zip` 是未签名开发包，需要通过 `about:debugging` 临时加载，重启浏览器后需重新加载。详见 [Firefox 安装说明](docs/FIREFOX.md)。

首次使用时，打开扩展设置页并添加翻译服务。详细操作见 [使用说明](docs/USAGE.md)。

## 本地开发

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

`npm run check` 会依次执行代码检查、类型检查、单元测试、生产构建和浏览器端到端测试。`npm run zip` 生成可用于浏览器商店提交或 GitHub Release 的 ZIP 文件。

## 项目结构

```text
src/                  扩展源码与静态资源
  content/            全文翻译和区域选择
  core/               翻译服务、调度和语言处理
  entrypoints/        后台、内容脚本、弹窗、设置页和侧边栏
  shared/             设置、存储、权限和类型
  ui/                 共享界面组件、Hook 和样式
tests/                单元、端到端、性能及验收测试
docs/                 使用、开发、公开发布与隐私文档
scripts/              构建辅助脚本
.github/workflows/    GitHub Actions 持续集成
```

更多资料见 [文档导航](docs/README.md)、[工程维护说明](docs/DEVELOPMENT.md)和 [变更日志](CHANGELOG.md)。

## 数据与安全

API Key 保存在浏览器扩展本地存储中，只允许扩展页面和后台读取。Firefox 使用扩展自身的 IndexedDB 隔离私有配置，会话密钥使用 `storage.session`。配置导出默认不包含 API Key 和自定义请求头。浏览器本地存储不等同于系统密钥保险箱，请勿在不可信设备上保存重要凭据。

云端接口必须使用 HTTPS；HTTP 只允许本机和局域网地址。扩展会在保存、测试或导入服务配置时申请对应站点访问权限。

对外发布前请阅读 [安全说明](SECURITY.md)、[隐私政策](docs/publishing/PRIVACY_POLICY.md)和 [发布检查清单](docs/PUBLIC_RELEASE_CHECKLIST.md)。

## 许可证

本项目采用 [MIT 许可证](LICENSE)，允许商业使用、修改、分发及闭源集成；分发时须保留版权声明和许可证全文。第三方依赖保留各自的许可证，翻译服务的费用与使用条款由对应服务商规定。详见 [第三方依赖说明](docs/THIRD_PARTY_NOTICES.md)。
