# Release checklist / 发版检查

版本来源为 `package.json`，当前为 `0.5.0`。发版前执行：

```bash
npm ci
npm run check
npm run doctor
npm run release:check
grok plugin validate .
```

`grok plugin validate .` 需要本机已安装 Grok CLI；其余检查由仓库测试覆盖。

`release:check` 会核对 `package.json`、通用 Agent Plugin、Cursor 插件、Grok 原生插件、市场清单和旧 Bot 文案版本，并检查 MCP 配置没有密钥。

```bash
VERSION="$(node -p "require('./package.json').version")"
git tag "v${VERSION}"
git push origin "v${VERSION}"
```

本项目不生成、不提交 ZIP。GitHub 仓库本身就是安装来源：

```bash
grok plugin install jellybeans-developer/rednote-ops-suite --trust
```

若要进入 xAI 官方插件目录，向 [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) 提交 PR，并按该仓库要求固定完整提交 SHA、更新索引并通过校验。市场审核是仓库外部流程；推送本仓库不会自动完成官方上架。
