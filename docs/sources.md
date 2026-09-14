# 输入文章与技术来源

## 官方内容

2026-09-06 实际读取：

- 知识：实现大目标：依靠「小胜」和「闭合任务回路」，刀熊说说，work_id 1523701957479239680。
- 故事：近视眼勇闯恐怖游戏，沈南因，work_id 1747681485547843585。
- 地址分别为 https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/1523701957479239680 和 https://api.zhihu.com/km-indep-home/hackathon/v2/story/1747681485547843585 。

原始接口响应保存在 src/data/sources。正文是接口返回片段，不宣称完整作品。分段超过 60 时合并尾部段落，不丢弃文本。

其余十篇为本项目原创示例，人物虚构，包含明确教学假设，不对应真实用户。它们与两篇官方片段均已由用户授权的当前 Codex 会话读取并加工为代码产物，来源记录为 codex/session。

## 常数与计算验收依据

- HNSW 原始论文：https://arxiv.org/abs/1603.09320
- Redis Pipelining 官方文档：https://redis.io/docs/latest/develop/using-commands/pipelining/
- 光速 299792458 m/s：BIPM SI Brochure，https://www.bipm.org/en/publications/si-brochure
- 生日概率使用独立均匀、365 天假设；理论值为 1−∏(1−i/365)，不把现实人口生日分布视为均匀。
- 家庭账本使用固定虚构收入、利率和期限，不声称是市场报价。
- 食物组合数值是教学给定参数，不作为真实营养标签。
- 中子星案例的密度是明确指定的数量级练习假设；质量由指定密度乘指定体积得到，不宣称可取出稳定的一勺物质。

这些条目是后续审阅生成结果的核对入口，并不意味着所有科学和数值案例都已验收。

## Runtime 依据

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
- https://developers.cloudflare.com/workers/platform/limits/

iframe 使用独立的 opaque origin；消息校验 source 窗口与一次性通道。CSP 限制连接和外部资源。它不是操作系统级的 CPU、内存沙箱，运行检查也不能证明任意程序永远安全。
