# 提交状态（2026-09-15）

## 已有实际证据

- GitHub 仓库已按负责人授权公开：https://github.com/pitchIT12138/yida-world ，已通过未登录请求确认。
- 视频播放页已发布：https://pitchit12138.github.io/yida-world/ ，HTML 与 MP4 未登录请求均为 200，视频与本地成片 SHA-256 一致，浏览器已实际播放。此页为视频展示，不是完整产品迁移；国内直连尚未独立验证。

- 公开版为 Sites v5；十七篇默认作品保留，二十五张原图保留。默认交互来自当前会话创作，线上用户生成使用 DeepSeek。
- 360×800、740×1000 的首屏和核心交互已实际操作；原文切换、图片回退与状态保留已有验收记录。
- 一个真实知乎账号已完成登录授权回调；一次个人生成成功并写入后台版本。不能由此声称两个真实账号隔离和退出已全部验收。
- 生成期间的状态查询已通过真实部署验证，约五秒更新一次；某次真实生成因模型 JSON 不完整且两次修复耗尽而失败，正确保留失败记录，没有上架。
- 当前代码已通过 check、158 项单元测试、test:studio 与 build。
- 随附视频录制公开网站的实际交互，未模拟登录或伪造生成成功，配中文合成旁白与字幕。

## 尚未完成

- 国内直连：用户遇到 chatgpt.site 的 Cloudflare 拦截，Ray ID 为 a3b14bcd4ed691f0。尚未解除，也没有独立替代地址；其他网络能访问不能证明国内已恢复。
- 两个真实账号的作品隔离、完整退出往返尚未全部实测。
- GitHub 后台成功生产上架和重复触发去重尚未完成验收；工作流暂停、定时关闭。
- 复杂作品的模型生成仍会失败，不能保证每篇自动生成成功。


## 提交方式

填写「表单填写.md」，粘贴「产品说明计划书.md」，上传「封面.png」与「ICON.png」。GitHub 链接填写 https://github.com/pitchIT12138/yida-world ，视频介绍链接填写 https://pitchit12138.github.io/yida-world/ 。不要填写本地文件路径。

当前作品链接：https://yida-world.zackguo.chatgpt.site/

知乎回调：https://yida-world.zackguo.chatgpt.site/api/auth/callback

本资料包不含任何 API 或 OAuth 密钥，不自动点击黑客松最终「发布」。
