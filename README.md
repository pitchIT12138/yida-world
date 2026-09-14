# 一答一世界

知乎黑客松 2026 · 知识炼金场。让 Agent 阅读文章，用程序继续作者的表达。

## 项目与演示

- [在线交互作品](https://yida-world.zackguo.chatgpt.site/)
- [实际演示视频（约 96 秒，中文旁白与字幕）](https://pitchit12138.github.io/yida-world/)
- [参赛产品说明](docs/submission/product-plan.md)
- [当前完成范围与待办](docs/submission/submission-status.md)

仓库已按项目负责人授权公开。视频页仅展示公开版实际操作；完整交互产品仍在上方作品地址。现有作品域名出现国内直连 Cloudflare 拦截，尚未验证恢复。

已实证一个真实账号完成知乎登录、一次个人生成和后台保存；双账号完整验证和后台生产成功上架仍未完成。内容生产工作流继续暂停，视频页发布不启用内容采集或模型任务。

## 当前实现

Svelte 5 阅读宿主、17 篇精选原文输入、知乎知识／故事导入、富文本粘贴与回答链接／ID 读取尝试、原图保存与离线 ZIP、经济／强模型配置、真实模型请求、段落选区、产物校验、最多两次修复、iframe 启动检查、手动设计讲解、片段之间与正文的联动、本地 SQLite／线上 D1 与 R2 持久化、可编辑原文、想法自动保存、版本历史和产物导入导出。

真实回答从页面“导入回答”进入，默认通过普通复制粘贴导入正文，自动识别富文本或纯文本；分享链接只记录出处，不自动联网。支持本地文本／网页文件和离线包。扫码浏览器与官方接口收进可选项，现场演示不依赖它们。外链媒体失败不阻止正文保存；全文核对且媒体保存齐全后，可以导出完整离线包。详细证据及边界见 [回答导入记录](docs/answer-import.md)。

**默认精选由 Codex 会话读取 17 篇原文及备注后生成。** 当前包含 45 个沿正文编排的表达片段；交互使用代码，DLSS 对照由 Runtime 注入已保存的原图。每篇保存为独立 AnswerArtifact，宿主没有按题材选择组件或模板。记录明确标注 method=codex、tier=session，不冒充 API 请求。

网页阅读默认产物不需要密钥。在线自然语言生成与修改仍需配置模型 API；Codex 会话没有被接入网页充当常驻服务。

## 本地启动

要求 Node.js 22.13+（本机使用 23.11）、npm；后台使用 Node 内置 SQLite。

    npm ci
    cp .dev.vars.example .dev.vars
    npm run dev

打开终端打印的本地地址。现有 .dev.vars 不应被覆盖。

## 配置模型

在被 Git 忽略的 .dev.vars 中填写：

    BALANCED_API_BASE=https://你的供应商接口地址/v1
    BALANCED_API_KEY=本地填写密钥
    BALANCED_MODEL=你的经济模型名称
    BALANCED_PROVIDER=openai-compatible

可选：同样设置 FRONTIER_API_BASE、FRONTIER_API_KEY、FRONTIER_MODEL。两档可以属于不同供应商。Anthropic 原生 Messages 接口使用 provider=anthropic，base 应以 /v1 结尾。

后端分别拼接 /chat/completions 或 /messages。前端不会收到地址、密钥或原始上游错误。生成记录保存实际模型名称和用量。没有配置的档位不会对读者开放。

本地经济档已按用户授权接入 DeepSeek，并以官方 /models 返回的 deepseek-flash 完成真实调用测试；当前使用 BALANCED_REASONING_EFFORT=none。凭证只存在被 Git 忽略的 .dev.vars，仓库示例配置仍留空。高能力档继续预留 Astral 中转。效果与限制见 docs/deepseek-evaluation-2026-09-14.md。

开发服务每次请求读取 .dev.vars；填写后点击“刷新模型配置”即可更新可用档位，此按钮只检查配置完整性，实际连接需真实生成验证。云端通过 Sites Secret 配置相同变量，不上传 .dev.vars。

默认总超时 120 秒、输出最多 12,000 token、每 IP 每分钟 4 个请求。请求频率计数是单 Worker 实例的保护，不是全局账单上限；公开上线必须另外在模型供应商设置硬预算。关闭 GENERATION_ENABLED 可以立即停用生成而保留阅读。

## 持续打磨

每篇回答都有“编辑原文”和“版本历史”。想法与选区自动保存到本地后台；导入、改原文、生成和恢复版本追加历史，编辑原文后把旧代码保留为下次生成的参考。SQLite 保存于 `.data/workspace.sqlite`，浏览器保留备份和待提交草稿。刷新后读取后台，重启本地服务后也能恢复。

完整备份、失败恢复、部署边界见 [工作区说明](docs/workspace.md)。本地工作区使用 SQLite；线上已接入 D1 和 R2，生成任务提供服务端状态查询。刷新后不会擅自新建模型任务。

## 准备精选

用户明确授权的当前会话路径：Codex 读取原文 → 生成 artifacts/session 中的原始产物 → record-session.ts 记录原文指纹与会话来源 → 同一校验器及 iframe 检查 → promote。不会生成 API 用量或费用。保存会话产物：

    npx tsx scripts/record-session.ts --file artifacts/session/hnsw.json

原始版本保存在 artifacts/session/v1，新版编排及代码保存在 artifacts/session/v2；信息优先的生日概率与 Redis 修订保存在 artifacts/session/v3。/tests/flow.html 使用实际候选产物验收阅读编排、联动和讲解，不进入发布包。

连接模型后的 API 路径：

1. 连接模型，在页面加工原文，实际操作结果，用自然语言修改。
2. 导出结果。文件保存原文、代码、说明、镜头和真实调用记录。
3. 验收后把文件提升为精选：

    npm run promote -- --file /绝对路径/结果.json --review "记录实际测试的操作、重置、手机布局与内容检查"

也可以先用同一服务端入口生成一个候选：

    npm run curate -- --answer hnsw --tier frontier
    npm run curate -- --file artifacts/candidates/某次结果.json --tier frontier --instruction "新的修改要求"

候选保存在 artifacts/candidates。脚本的结构检查不等于浏览器验收。先在页面导入、完成操作检查，再 promote。正式精选保存在 src/data/generated，运行记录和审阅记录保留。

每次完成验收并 promote 后运行 npm run baselines，沉淀风格、片段设计与代码指纹。详见 [设计基线](docs/baselines/README.md)。

原文 ID 可见 src/data/seeds.ts。该文件只有输入文本，不包含最终场景。

## 验证

    npm run check
    npm test
    npm run build
    # 开发服务运行时，隔离后台与实际候选界面验收
    npm run test:workspace-ui
    npm run test:session-v3
    npm run benchmark

benchmark 会真实调用已配置的经济模型十次（五篇原文的生成与修改），因此会消耗其额度；模型未配置时不要运行。报告记录延迟、用量和结构结果，不伪造模型质量或价格。

开发环境下 /tests/runtime.html 是隔离的验收页，验证 iframe、正文绑定和启动错误。不会进入构建。

## 构建与部署

输出为 dist/client（静态页面）和 dist/server/index.js（Worker ESM fetch 入口），元数据位于 dist/.openai。Worker 支持 ASSETS 绑定，并内置同一构建静态资源的后备响应。

Sites 项目已经注册但尚未发布。默认产物可本地体验；正式提交仍须完成在线模型连接、完整生成与修改验收，再公开部署并确认状态。当前不能把本地可运行描述为线上交付完成。

参赛原型使用独立域名，不向知乎主站发布可执行代码。当前本地工作区不做公共投稿或用户账号体系；云端持久化需另接数据库与用户隔离。

## 资料

- docs/generation-contract.md：生成边界及用户修正
- docs/product.md：产品说明初稿
- docs/demo-script.md：三分钟演示脚本与录屏清单
- docs/verification.md：真实验证记录与待验证项

原文出处、计算假设见 docs/sources.md。公开源码前核对官方内容的比赛使用边界；不要把仓库上级的聊天存档、私人配置和废弃图片打包进去。

## 内部回答工作台

开发服务启动后打开 `/studio/`，粘贴回答、记录整体想法与段落备注、预览助手加工结果。使用独立本地数据库，不在产品页面提供入口，不进入正式发布包。支持经验与可改编交互代码积累，以及助手验收后加入产品精选。操作和命令见 [内部工作台](docs/studio.md)。
