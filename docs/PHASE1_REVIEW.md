# 一期开发计划完成度核对报告

> 核对日期：2026-09-08
> 依据文档：TRANSLATION_EXTENSION_PLAN.md（文档版本 1.0，2026-08-28）
> 核对对象：当前工作区代码（develop 分支，含未提交重构）
> 核对范围：一期（P0 最小可用版本）为主，同时覆盖计划中已勾选的 P1 / P2 项

## 一、总体结论

一期（P0 最小可用版本）已完成，且实际进度已远超一期：
计划中 P0、P1、P2 的全部勾选项均已在代码中落实。
验证过程中发现一处测试环境问题（详见第四节），已当场修复。
后续一期整合已补齐浏览器端到端测试、选区稳定性检查和冗余依赖清理（详见第六节）。
第二、三节行号为首次核对时的位置，整合后请按函数名定位。

## 二、P0 逐项核对（全部完成）

| 计划项 | 代码位置 | 状态 |
| --- | --- | --- |
| 普通网页选区 / input / textarea / 跨节点选取 | entrypoints/content.tsx:106 readSelection()；光标镜像计算 content.tsx:77 | 完成 |
| 获取选区坐标 | content.tsx:133（取选区最后一个矩形） | 完成 |
| 滚动 / 缩放后更新浮层位置 | content.tsx:194（scroll/resize 监听 + viewportRevision） | 完成 |
| 点击页面其他位置关闭圆点 | content.tsx:365（selectionchange 处理） | 完成 |
| 重新选择时更新文本 | content.tsx:344（文本变化时取消旧请求并重置） | 完成 |
| 忽略空白、过短或过长文本 | minChars/maxChars 校验 content.tsx:337、截断 content.tsx:343 | 完成 |
| 点击圆点翻译 | content.tsx:444 | 完成 |
| 自动翻译模式（含防抖） | content.tsx:351（400ms setTimeout） | 完成 |
| 请求取消 | requestId + AbortController + Port 断连清理（content.tsx:203、background.ts:92/188） | 完成 |
| 通用自动重试 | background.ts:147（3 次指数退避重试，750ms×2^n） | 完成 |
| 右键菜单 / 快捷键翻译 | background.ts:42-62 | 完成 |
| Shadow DOM 浮窗、流式显示、加载/失败/超时状态 | content.tsx:504-517、ViewStatus 状态机 | 完成 |
| 复制原文和译文 | content.tsx:315 copyText() | 完成 |
| 防止浮窗超出视口 | content.tsx:70 clampPosition() | 完成 |
| 亮色 / 暗色主题 | content.tsx:55（prefers-color-scheme） | 完成 |
| 模型新增 / 编辑 / 删除，全部配置字段（名称、URL、Key、模型、Headers、Temperature、最大输出、超时） | entrypoints/options/main.tsx:448 模型编辑弹窗 | 完成 |
| 测试连接 / 设置默认模型 | options/main.tsx:261 testProfile()、activeModelId 管理 | 完成 |
| OpenAI-compatible Provider | core/providers/openai-compatible.ts | 完成 |
| 源语言自动检测 / 目标语言 / 触发模式 / 字符范围 / Prompt / 输出模式 / 场景提示词 / 白黑名单 | options/main.tsx:346-385；内置敏感站点黑名单 shared/constants.ts | 完成 |

## 三、P1 / P2 完成情况（计划中已勾选，代码核对属实）

- 多模型快速切换：entrypoints/popup/main.tsx（模型/场景/语言快速切换）
- Anthropic 协议 Provider（含 x-api-key / bearer / 双发鉴权）：core/providers/anthropic.ts
- Gemini 原生 Provider：core/providers/gemini.ts
- Ollama / LM Studio / Xinference / vLLM / SGLang 适配：core/providers/registry.ts（统一复用 OpenAI 兼容协议，各自提供默认地址与占位符）
- 翻译历史（查看 / 复制 / 单条删除 / 清空 / 收藏 / 搜索）：shared/history.ts + options 页历史分区
- 相同文本结果缓存（SHA-256 键、7 天过期、100 条上限）：shared/history.ts
- Side Panel 长文本翻译：entrypoints/sidepanel/main.tsx
- 原文译文对照：历史条目双栏展示（options/main.tsx:429）
- 翻译结果编辑：浮窗"编辑"按钮（content.tsx:477）
- Prompt 模板管理（按场景编辑、变量替换、复制、恢复默认）：options/main.tsx:374-385
- 配置导入导出（含密钥 / 不含密钥两种模式，导入校验）：options/main.tsx:102-130
- UI 国际化（简体中文 / English）：各 UI 内联 t() 双语
- 按模型使用量统计（请求数、输入输出字符、最后使用、单模型清零）：shared/history.ts + options 模型卡片

## 四、核对过程中发现并修复的问题

问题：npm test 修复前 18/37 个测试失败。

原因：tests/setup.ts 在顶层 import shared/db 与 shared/history，
导致 @wxt-dev/browser（经 wxt/utils/storage 引入）在 WXT 测试插件
stub browser 全局变量之前就完成模块求值，browser 被固化为 undefined，
所有涉及 storage / IndexedDB 的测试随之失败。

修复：将两个 shared 模块改为在 beforeEach 中动态导入，
保证首次求值发生在虚拟 setup（virtual:wxt-setup）stub 全局之后。

修复后：37/37 全部通过。
该问题属于新测试脚手架的环境问题，非功能缺陷。

## 五、验证结果汇总

- npm run typecheck：通过
- npm run build：通过（chrome-mv3，总大小约 690 KB）
- npm test：修复前 18/37 失败 → 修复后 37/37 通过
- Playwright：真实 Chromium 加载生产扩展，12/12 通过（2026-09-08 整合验证）

## 六、剩余差距整合结果（2026-09-08）

1. 端到端测试：已补齐。
   新增 `playwright.config.ts`、`tests/e2e/fixtures.ts` 和 `tests/e2e/translation.spec.ts`。
   通过真实 Chromium 扩展、后台 Port、Provider 和本地 SSE 服务验证：
   普通段落、跨节点、input/textarea 选区，流式输出，400ms 自动翻译防抖，
   相同文字不同选区的稳定性，重选/清空选区取消请求，拖动期间不翻译，
   明暗主题及 SPA 路由变化取消请求。测试不使用真实凭据或云端接口。
   `npm run test:e2e` 自动构建再执行测试，`npm run check` 执行完整验证。

2. 技术栈偏差：已明确并清理。
   一期继续使用 React 状态和原生 CSS；移除未使用的 Zustand、React Hook Form、
   `@hookform/resolvers`、Tailwind 和对应 Vite 插件，并同步锁文件。
   **保留 Zod**：当前 `shared/security.ts` 已实际用于配置导入校验，首次报告对其使用情况的描述不准确。

3. 自动翻译选区稳定性：已修复。
   原 effect 依赖选区文本，状态更新可能触发清理并取消刚建立的定时器。
   现监听器仅随设置更新，使用 ref 读取当前选区；在 400ms 到期时显式核对
   文本、DOM 节点及起止偏移，输入框同时核对焦点、值和选区偏移。
   `selectionchange` 重置稳定性窗口，鼠标按下至松开期间不触发自动翻译；
   手动翻译清理待触发定时器，过期请求消息不再更新当前结果。

4. 工作区重构：已在现有改动基础上完成整合验证。
   Provider 注册层、IndexedDB 历史/缓存、凭据与设置模块拆分以及 Vitest 迁移
   均保留，并通过类型检查、单元测试、生产构建和浏览器回归测试。
   改动仍位于工作区，本次未创建 Git 提交。

## 七、总体评价

本报告列出的代码差距已处理，一期核心流程已有单元测试和真实浏览器回归覆盖。
端到端验证使用本地模拟服务；真实模型服务、Chrome/Edge 多版本及常见网站的
人工兼容性抽样仍属于发布验收范围，不能由本轮自动化结果替代。
