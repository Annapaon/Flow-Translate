# 工程维护说明

## 目录职责

- `src/entrypoints/`：WXT 入口及入口专属界面，页面的 HTML、TSX 和 CSS 就近放置。
- `src/content/`：网页内的全文翻译逻辑。
- `src/core/`：模型接口、机器翻译服务与翻译流水线。
- `src/shared/`：跨入口使用的设置、权限、存储、类型和公共组件。
- `src/public/`：直接复制到扩展安装包的资源，不放设计源文件或私有配置。
- `tests/unit/`、`tests/e2e/`：单元测试和浏览器测试；公共单元测试初始化保留在 `tests/setup.ts`。
- `docs/plans/`、`docs/releases/`、`docs/reviews/`、`docs/publishing/`：规划、版本记录、检查报告和商店材料；`docs/assets/` 保存设计源素材。
- `scripts/`：构建辅助脚本；根目录保留包管理、构建、测试和风格配置。

WXT 通过 `srcDir: "src"` 和 `publicDir: "src/public"` 定位源码与资源。产物位置仍是 `.output/chrome-mv3/`，已安装开发版本的加载路径无需修改。新增单元测试放在 `tests/unit/`；修改目录时需同步相对导入、配置和文档链接。目录整理保留现有业务模块划分，未拆分页面内部实现。

## 开发与检查

项目使用 npm 和已提交的 `package-lock.json` 锁定依赖，首次安装或拉取依赖更新后执行 `npm ci`。不要混用其他包管理器的锁文件。当前 ESLint 要求 Node.js `^20.19.0 || ^22.13.0 || >=24`，其他依赖也可能有最低版本要求；建议使用 Node.js 24。本次检查环境为 Node.js 26.5.0、npm 11.17.0。

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

`npm run check` 串行执行 lint、类型检查、单元测试、构建与端到端测试。Linux 测试环境缺少浏览器系统依赖时，可使用 `npx playwright install --with-deps chromium` 安装。测试使用本地模拟服务；真实 API 联调另行进行。

`npm run build` 生成 `.output/chrome-mv3/`，`npm run zip` 生成商店提交包；包通过发布附件或商店后台分发，不加入源码仓库。仅调整工程配置或文档时不自动提升插件版本。

## Git 提交边界

需要提交源码、测试、静态资源、文档、共享工程配置及 `package-lock.json`。`.gitignore` 分组排除以下本地文件：

- 依赖与生成产物：`node_modules/`、`.wxt/`、`.output/`、根目录 `dist/` 和 `build/`、TypeScript 增量缓存、ZIP/CRX 安装包。
- 环境与凭据：`.env` 和 `.env.*`、私钥及证书容器、根目录 `secrets/` 和 `credentials/`；允许提交不含真实凭据的 `.env.example`、`.env.*.example`。
- 用户导出配置：任意目录中的 `translator-settings*.json`，包括放在 `docs/` 下的导出文件。此类文件可能包含 API Key、自定义请求头和私人服务地址。需要共享导入测试样例时，先脱敏，再以其他文件名放入 `tests/fixtures/`。
- 测试与本地状态：覆盖率、Playwright 报告、失败截图/trace、认证状态和缓存；端到端浏览器配置目前在系统临时目录创建并清理。
- 日志、临时文件、个人 IDE 设置和系统元数据。若后续需要共享 VS Code 配置，应明确放行具体文件，再提交经过检查的配置。

不要笼统屏蔽所有 JSON、图片或 Markdown，这些格式包含本项目的源码配置、图标和发布文档。`.env` 文件不会因为允许本地保存就自动被应用读取；不要通过前端构建环境变量注入真实 API Key。

`.gitignore` 只影响未跟踪文件，不会删除已提交文件或清理 Git 历史。提交前可检查：

```bash
git status --short
git ls-files -ci --exclude-standard
git diff --check
git diff --cached
```

第二条命令用于发现“已被跟踪但符合忽略规则”的文件。本次整理检查未发现此类文件。如果以后出现，应确认文件性质后用 `git rm --cached -- 路径` 停止跟踪并保留本地文件；真实密钥已经泄漏时还需要撤销或轮换密钥，单独添加忽略规则不能解决历史泄漏。

## 代码风格

`.editorconfig` 统一 UTF-8、LF、两空格缩进和文件末尾换行；Markdown 保留用于换行的行尾空格。Prettier 配置使用双引号、分号和无尾随逗号。格式化命令同时读取 `.gitignore` 与 `.prettierignore`，跳过产物、私人配置和依赖锁文件。

```bash
npm run format:check
# 修改格式：会重写所有未忽略的支持文件，建议单独提交
npm run format
```

存量文件尚未进行全仓格式化，`format:check` 可能报告历史样式差异，因此暂未加入 `check`。本次仅补齐工具配置，不将全仓风格变更混入功能改动。

ESLint 使用 JS/TypeScript 推荐规则与 React Hooks 调用规则；显式 `any` 暂时兼容既有浏览器模拟和服务载荷代码，未使用变量作为警告，解构排除字段和下划线前缀按约定处理。空 `catch` 允许用于端口关闭等容错场景；Playwright fixture 的空参数解构单独放行。TypeScript/WXT 负责项目类型与全局名称检查。现有类型检查配置不包含测试文件，测试文件由 ESLint 和测试执行覆盖，不等同于完整的测试类型检查。

## 基础工程配置验证（2026-09-14）

- Git 忽略规则：19 个应排除路径与 12 个应保留路径校验通过；没有已跟踪文件命中忽略规则。
- `npm run lint`：0 错误、7 条现有 React Hooks 依赖及失效禁用注释警告，待逐项核对实际行为后处理。
- `npm run typecheck`：通过；`npm test`：7 个测试文件、89 项测试通过。
- `npm run format:check`：报告 65 个存量文件的格式差异，未执行全仓重写。
- 此轮基础配置调整未运行浏览器端到端测试，也未重新生成发布包；后续目录整理验证另记如下。

## 目录整理验证（2026-09-14）

- 源码统一迁入 `src/`，单元测试迁入 `tests/unit/`；同步调整 WXT、Vitest、模块导入、隐私政策生成脚本和文档路径。
- 类型检查通过，89 项单元测试与 40 项浏览器端到端测试全部通过。
- 生产构建通过，已核对弹窗、设置页、侧边栏入口、图标与 Alt+Q 默认快捷键声明。
- 源码相对引用、文档本地链接和 Git 差异格式检查通过；ESLint 仍为 0 错误、7 条存量警告。
- 安装包输出目录与版本保持不变；此次生成了测试使用的构建目录，未重新生成 ZIP 发布包。
