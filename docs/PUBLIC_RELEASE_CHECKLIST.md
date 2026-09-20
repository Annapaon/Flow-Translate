# GitHub 公开发布检查清单

## 仓库准备

- 确认扩展清单及 npm 包版本均为 `1.0.0`。
- 确认 GitHub 仓库名称和公开范围，再添加 GitHub 远程地址。
- 检查 `v1.0.0` 标签是否指向最终发布提交；不要直接执行 `git push --tags`，只推送确认过的发布标签。
- 保留根目录 MIT `LICENSE`，核对第三方依赖的许可证和分发声明。
- 启用 GitHub 的 Private vulnerability reporting，供 `SECURITY.md` 中的流程使用。

## 内容与隐私

- 使用 `git status --ignored` 确认 `.output/`、`node_modules/`、测试报告和用户配置未进入提交。
- 确认 `.local/` 中的规划、评审、旧发布记录和设计源图未进入提交。忽略规则不会清理已有 Git 历史，发布前也应检查拟推送的历史。
- 搜索并排除 API Key、访问令牌、私人接口、个人邮箱和浏览器状态。
- 将 `docs/publishing/PRIVACY_POLICY.md` 中的 `[CONTACT_EMAIL]` 替换为真实公开邮箱。
- 运行 `PRIVACY_CONTACT_EMAIL='公开邮箱' npm run build:privacy`，将生成页面部署到公开 HTTPS 地址。

## 验证与打包

```bash
npm ci
npm run check
npm run zip
```

- 校验 `.output/flow-translate-1.0.0-chrome.zip` 能正常解压，且其中 `manifest.json` 的版本为 `1.0.0`。
- 在全新 Chrome/Edge 用户目录中加载解压版本，人工检查首次确认、服务配置、划词、全文、长文本和配置导入导出。
- 使用专用测试账户验证计划公开支持的真实翻译服务，不要把测试密钥写入仓库或截图。

## GitHub Release

- 合并或推送发布分支后，从正确的发布提交创建或核对 `v1.0.0` 标签。
- Release 标题使用“流译助手 1.0.0”，正文可采用 `docs/releases/RELEASE_NOTES_1.0.0.md`。
- 只上传最终 ZIP 和必要的公开说明；源码由 GitHub 自动生成归档。
