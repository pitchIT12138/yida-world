# 2026-09-14 首发记录

作品链接：https://yida-world.zackguo.chatgpt.site

知乎后台需要登记的精确回调地址：
https://yida-world.zackguo.chatgpt.site/api/auth/callback

当前为公开可读版本。保留 17 篇既有回答、25 张原图和对应原有交互，真实来源先于原创示例。内部 Studio、清洗记录、备注和候选不进入公开构建。本地一致性备份：`.data/release-backups/20260914-222715/`。

## 已交付

- 讨论发现、交互新作、个人作品入口；游客无需登录阅读。
- 服务端身份隔离、持久化版本校验、D1 额度、R2 原图与产物、一次性 OAuth state 和 HttpOnly 会话实现。
- 私有仓库手动 GitHub Actions，采集正文、共享生成、独立内容检查、真实浏览器检查、最多两次修复、失败留存、验收通过后上架。没有定时触发。
- 当前部署可作为阅读演示链接，未配置登录时不能生成个人作品。
- 产品计划书 `product-plan.md`、16:9 封面 `cover.png`、正方形 `icon.png`、90 秒演示脚本 `video-script.md`。图片均小于 5 MB。

## 本轮尚未完成

- 真实知乎登录往返：缺少 App ID、App Key 及活动后台登记确认。热榜与本人全文同步另缺 Access Secret。
- 三篇 DeepSeek 新版尚未通过验收，未替换产品现有展示版本。Studio 中保存了候选和失败原因；API 原始输出、耗时、用量与修复记录保存在本地 `artifacts/release-upgrades/`。
- 老龄化：候选产出指数漏乘100、部分年份说明不联动；最后修复输出达到上限。
- DCF：候选工资联动、负数图形与输入范围仍有问题；最后修复含 JavaScript 语法错误。
- 近视故事：候选揭示按钮缺少实际显隐；最后修复 JSON 不完整。
- 首次后台实跑取得《打造职业发展的金字塔》正文并真实调用模型；结构修复达到两次后仍因讲解步骤指向错误而失败，未上架。重复触发命中原失败任务，没有再次生成；去重验收通过。尚未完成成功上架的全流程验收。

每个生成任务最多两次修复；多轮实验分别留存，没有把失败输出或人工代码包装为模型成功版本。

## 外部接口核对

实际访问发现知识正文由 `/hackathon/v2/knowledge/{work_id}` 返回；同 ID 请求文档示例中的 `/story/{work_id}` 返回作品不存在。实现按实际对应的内容类别读取，并记录真实来源 URL。普通知乎问题摘要不能代替正文，本人全文授权范围仍限定 Access Secret 所属账号。

## 实际验收证据

公开页在 740px、360px 下通过游客阅读、真实回答优先、DLSS 分隔线两端/中点、键盘、触摸复位、原文恢复；17 篇媒体记录的 25 张图 SHA-256 与本地完全一致。证据：`artifacts/reviews/release-production/evidence.json`。

`npm run check` 无错误，`npm test` 140 项通过，`npm run test:studio` 通过，`npm run build` 通过。身份与额度测试使用明确的测试身份；没有把它们记录为真实知乎登录。

私有后台首次运行：34858813114。重复触发：34859311651。日志和源快照保存在 GitHub Actions 及本地 `artifacts/pipeline-first-run`、`artifacts/pipeline-dedup-run`。

生成策略 v7 为修复增加模型自写局部 JSON 补丁，避免重写正确代码；补丁不能修改来源或溯源，应用后仍进行结构、语法和浏览器校验。每任务两次修复的额度不变。
