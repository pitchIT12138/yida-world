# 首发运行说明

网站继续使用现有 Sites 项目。前端静态产物和 Worker 一起发布；图片字节不再内嵌 Worker，由 R2 提供。

## 服务端配置

Sites Secrets：BALANCED_API_KEY、RUNNER_TOKEN、ZHIHU_APP_KEY、ZHIHU_ACCESS_SECRET。普通变量：BALANCED_API_BASE=https://api.deepseek.com、BALANCED_MODEL=deepseek-flash、BALANCED_PROVIDER=openai-compatible、BALANCED_REASONING_EFFORT=none、GENERATION_ENABLED=true、ZHIHU_APP_ID、ZHIHU_REDIRECT_URI。

知乎回调必须与活动后台登记的完整 HTTPS 地址相同，路径为 /api/auth/callback。登录仅需 App ID/Key；热榜和本人全文另需 Access Secret。本人全文不是任意 OAuth 用户的全文读取能力。

GitHub Actions Secrets：DEEPSEEK_API_KEY、RUNNER_TOKEN、可选 ZHIHU_ACCESS_SECRET。变量：RELEASE_URL；可选本人正文链接逐行填 ZHIHU_OWN_CONTENT_URLS，并设置 ZHIHU_OWNER_NAME。Secrets 不进入代码或工作流输出。

## 运行和恢复

在私有仓库 Actions 中选择 Collect and verify interactive answers，手动运行，选择 knowledge/story 和可选的官方 work_id。没有定时触发。第一次生产失败不会改变公共内容，检查任务产物中 source、candidate、content-review、checks、evidence 或 failure。取得原文、生成、内容验收与真实操作全部通过后才提交发布。

网站发布使用 Sites 版本；模型产物使用回答版本。上一发布版本与上一回答版本分别保留。数据库迁移只追加；不会在 Worker 启动时改表。部署失败后先核对已应用迁移，禁止删除生产已执行的迁移记录。

本地 Studio 和上云工作区独立；内部备注、清洗记录和未入选草稿不公开。本地数据库已有一致性备份，目录 .data/release-backups。公开精选媒体在部署后用 scripts/seed-release.ts 迁移，逐篇核对返回计数。

任务上限：普通用户 3 次/日，全站普通用户 20 次/日，后台内容 6 篇/日；日界按 Asia/Shanghai。失败任务也计入额度，每任务最多两次修复。本文数值与 server/cloud.ts 保持一致。
