# DSH GO 插件市场条目

`dsh-go-market.json` 是提交到 [ccch1mneyyy/dsh-go-market](https://github.com/ccch1mneyyy/dsh-go-market)
的条目内容（条目格式见该仓库的 `schema/plugin.schema.json`）。

上架要求（摘自市场 README）：

1. npm 上有一个**精确版本**的 DSH bundle，带 OSI 许可证（本包 MIT）；
   `latest`、版本范围、Git 地址都不收。
2. 在市场仓库 `plugins/` 下新增一个 JSON：非 scoped 包用 `<包名>.json`，
   `@scope/name` 用 `@scope__name.json`。本包对应 `plugins/@ban-sky__dsh-github.json`。
3. 向 main 提 PR，一次只改一个条目。升级只改这个文件的 `version`，不追加历史版本。
4. 自动检查通过后自动合并；这里不要写 `tier`、risk、integrity 或审核结论。

本地核对：

```sh
git clone https://github.com/ccch1mneyyy/dsh-go-market
cd dsh-go-market
mkdir -p plugins
cp ../dsh-github/market/dsh-go-market.json plugins/@ban-sky__dsh-github.json
npm ci --ignore-scripts && npm run check
```

`version` 必须和 `package.json` 里已发布到 npm 的版本一致；发新版时两个文件一起改。
