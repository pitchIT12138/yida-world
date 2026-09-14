# 内部回答工作台

在 `web` 目录运行 `npm run dev`，打开终端地址下的 `/studio/`。这是本机单人工作台，不在产品导航中，也不进入正式构建。默认数据保存在 `.data/studio.sqlite`，与产品工作区数据库独立；停止开发服务后备份整个 `.data` 目录。

## 录入与反馈

1. 点击“粘贴新回答”，从知乎复制正文，粘贴到正文框，补充标题、作者和来源链接，保存原文。富文本粘贴保留结构和图片；手动编辑正文文本框后按纯文本保存。
2. 写整体可视化想法、匹配标签；在右侧对应段落点击“给这段加备注”。备注和预览反馈自动保存，原文需明确点击保存。
3. 可展开“原文与离线保存”保存媒体。缺图不阻止正文保存，外部媒体获取失败可补充文件。
4. 告诉开发助手处理哪些回答。助手处理完后点“刷新后台”，预览完整交互并继续填写反馈。

当前助手不是常驻后台；保存素材不会自动触发模型调用。后台写入失败时浏览器保留待提交备注草稿；重开后点击“恢复未保存草稿”。若版本冲突，先复制当前备注，再刷新页面打开后台版本，人工合并，不自动覆盖他人的修改。编辑原文后旧效果转为历史参考；失效段落备注保留，可重新关联。

## 助手加工接口

所有命令从 `web` 目录执行。`--db` 可指定隔离数据库，默认 `.data/studio.sqlite`。

```sh
npm run studio -- list
npm run studio -- export --id ANSWER_ID
# 输出 .data/handoffs/ANSWER_ID.json，包含 expectedRevision 和相关组件。
# 阅读交接文件及库实现后创作 artifact.json。
npx tsx scripts/record-session.ts --file artifact.json --source .data/handoffs/ANSWER_ID.json
npm run studio -- import --id ANSWER_ID --file artifacts/candidates/ANSWER_ID.json --revision EXPORTED_REVISION
npm run studio -- accept --id ANSWER_ID --checks checks.json --review "实际检查的事实、公式、操作、重置和阅读编排"
npm run baselines
```

`record-session` 的 `--source` 接受交接文件、含 source 的文件或直接原文；记录真实 method=codex、tier=session，不伪造 API 用量。导出后的原文或备注已变化时，写回必须重新导出，不接受过期版本。

`checks.json` 是实际浏览器操作及精确预期文本列表，例如：

```json
[{"blockId":"birthday-compare","action":"click","selector":"#fifty","expect":{"selector":"#any","text":"97.0%"}}]
```

支持 click、fill（附 value）、check、range（附 value）和 press（键盘按键）。验收命令在 740 和 360 像素宽度执行启动与操作检查；仍须助手核对事实、适用条件、重置和整篇编排，在 review 中记录实际结果。失败不发布。验收证据包含时间、观察值、产物指纹。加入精选是更新本地产品数据，不等于部署网站。

## 经验与可改编组件

`library/interactions/<id>/<version>.json` 保存不可覆盖的版本，包含解释目标、适用条件、避免误用的条件、提示指导、可改参数、代码、绑定与验收条件。经验与代码共同组成一个可复用条目；示例数据只能在适用假设下使用。

首批从现有 birthday 与 redis 已有案例提取概率比较和延迟比较。生成按标签匹配，最多读取三个不同组件的最新版本；旧版本仍可解析。新意图和事实优先，不匹配时正常创作。

添加组件需要提供 meta.json（id、正整数字符串 version、title、tags、goal、when、avoid、guidance、parameters、checks）：

```sh
npm run library -- add --file src/data/generated/ANSWER_ID.json --blocks BLOCK_ID --meta meta.json --checks checks.json
npm run library -- sync
```

add 运行实际交互检查，保存来源与版本，拒绝覆盖同版本文件。sync 将所有版本同步到生成上下文目录。库不依赖运行时下载或外部框架；引用组件的最终代码仍完整嵌入 AnswerArtifact。

产物通过 `libraryReferences` 记录 id、version、mode（reuse/adapt）、changes 和 blockIds。直接复用要求 HTML/CSS/JS 与库一致；改代码必须标记 adapt，说明具体修改。段落与绑定需映射到新原文，事实、单位、参数和公式须重新核对。

## 隔离与验证

工作台页面在独立 HTML 入口中，API 仅挂载于 Vite 开发服务。正式产品只加载通过精选流程导出的 source、assets、artifact；导出时移除内部工作台、草稿和私有提示文本。公开设计说明及组件修改说明由助手撰写，不得包含私有备注原文。

运行 `npm run check`、`npm test`、`npm run test:studio`、`npm run build`。工作台浏览器测试使用临时数据库，不往产品精选写测试数据。浏览器截屏保存于 `artifacts/reviews/studio`。

## 2026-09-14：清洗与整批重构

`npm run studio -- seed` 预览尚未进入 Studio 的精选；加 `--apply` 按原 ID 导入并保存首个历史版本，已有记录不覆盖。

`npm run studio -- clean --id ID --file plan.json` 输出差异；加 `--apply` 按 expectedRevision 保存。计划包含 id、expectedRevision、完整清洗后 source，以及 changes（原 paragraphId、reason、replacementIds）。每个删除或修改必须有说明，新段落必须有映射。清洗前记录、计划和差异保存在 `.data/cleaning/ID/REVISION.json`；实际原文变更进入数据库历史。只能精确定位到一个新段落的备注自动关联，其他备注保留为失效引用。

片段允许 `mediaUrls` 引用当前原文图片，HTML 使用 `<img data-source-image="原图URL">`；Runtime 只注入已保存的图片，iframe 仍不能联网。`replaceParagraphIds` 仅可引用参与比较的纯图片段落；图片成功解码后默认折叠原图，失败、查看原文时恢复。补充资料链接在宿主的“补充资料与核验来源”中可打开。原文图片字节不进入生成代码。

单篇最多24个片段、48步讲解，代码体积上限保持260,000字符。`checks.json` 另外支持 range（设置范围控件并触发输入）和 press（键盘操作）；每篇检查窄屏溢出与引用图片解码。

本轮会话创作代码在 `artifacts/session/rebuild/author.py`，只用于离线组装，不进入宿主或线上模板选择。`npm run test:rebuild` 额外验收离线交互、原图恢复和真实图片的触摸操作。DLSS 第6、7组延迟标记与作者规则不一致，保留原图并明确待核对；未推断不可靠的开关方向。


阅读页使用 `npm run baselines` 生成的 `src/data/curated-index`，保存的原图仍以 `src/data/generated` 为准，进入相应回答视口后按需加载。修改精选后必须同步基线，不能单独编辑轻量目录。

本轮交付与逐篇核对详见 [17 篇重构记录](rebuild-2026-09-14.md)。
