# 发布 @xixka/dsh-share

`@xixka/dsh-share` 的 npm 发布完全由 GitHub Actions 完成，本地不执行编译或发布：仓库 secret `NPM_TOKEN` 加密保存 npm 发布凭据，workflow 构建产物并发布。

## 本地与 CI 校验

安装依赖后执行：

```sh
pnpm release:check
```

该命令会完成类型检查、构建、测试和 `git diff --check`，再在系统临时目录生成 npm tarball，确认包名、版本、体积、运行时入口、README、许可证和预览图齐全，同时拒绝把源码、测试、脚本或 GitHub 配置装入发布包。它不会创建 tag、推送代码或发布 npm。

CI 在 `main` push 和 pull request 上执行同一检查，并上传构建产物 `lib/` 作为 artifact；`lib/` 不入库，由 CI 产生。

## 发布通道

1. **CI 自动发布**：`main` 分支的 push 在校验通过后由 `publish` job 直接发布当前版本；npm 上已存在的版本会自动跳过。
2. **Tag 发布**：推送 `v*` annotated tag 触发 Release workflow，校验 tag 与 `package.json` 版本一致、位于 `main` 历史后，生成一次 tarball 并发布同一文件到 npm，再创建附带该文件的 GitHub Release。

## 发布版本

发布前确认：

- `main` 包含完整源码和测试；`lib/` 只由 CI 构建产出。
- `package.json` 中是本次要发布的 SemVer 版本，包名为 `@xixka/dsh-share`。
- `CHANGELOG.md` 已记录并经人工审阅确认该版本。
- 仓库 Actions secret `NPM_TOKEN` 为目标 npm 账号的有效发布 token。
- `pnpm release:check` 与 GitHub CI 均通过。

然后为待发布的 `main` 提交创建与 `package.json` 版本完全一致的 annotated tag（格式为 `vX.Y.Z`，预发布版保留后缀）并推送。不要复用或移动已经发布的版本 tag；npm 版本不可覆盖，修复发布内容时必须提升版本号。

如果 npm 发布成功但 GitHub Release 创建失败，只补建相同 tag 的 GitHub Release，不得重新发布或覆盖 npm 内容。
