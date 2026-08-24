# TURTLE SOUP 最终真人评测准备包

状态：12 案已由 [v0.6 冻结清单](../content/zh/cases/manifest.v0.6.json) 固定；自动化验收已执行，真人评测尚未执行。真人评测仍是最终发布门槛，不是当前开发阻塞。

## 测试范围

最终 12 案冻结后，先用 C01 做正式 Fun Gate，再抽测 C02–C12 的公平性和语言覆盖。测试者不得读取案件 JSON、测试向量、作者审查报告或答案讨论。

测试环境：

- Web/PWA，关闭开发者工具和源码查看
- 桌面 1440×900、手机 390×844
- 每位测试者使用干净浏览器上下文
- 无账号、无远程分析；使用产品内“测试模式”导出匿名 JSON/CSV

## 无剧透主持词

> 你要调查一件短案件。可以提问、检查证据、建立事件链并提交证明。系统的回答是在验证事实，不是在直接告诉你答案。请尽量独立完成；我只会记录你卡住的位置，不会提示案件事实。

主持人只能解释按钮和操作方式，不能提供对象名、问题方向、正确理论或缺口答案。

## 观察记录表

每位测试者一行：

| 字段 | 记录 |
| --- | --- |
| tester_id | 产品导出的匿名编号 |
| case_id / viewport | 案件与桌面/手机 |
| understood_question_loop | 0/1 |
| first_action_seconds | 首次有效操作时间 |
| completed | 0/1 |
| solved_without_hint | 0/1 |
| solve_seconds | 结案耗时 |
| question_count / repeat_count | 提问与重复提问 |
| ambiguity_recovery | 0/1 |
| wrong_theory_count | 错误理论数量 |
| replay_opened | 0/1 |
| proof_satisfaction | 1–5 |
| friction_category | case / fairness / language / interaction / presentation |
| verbatim_quote | 玩家原话 |

产品导出的 JSON/CSV 只含聚合体验指标，不包含真相、事实 ID、证书、内部事件 ID 或答案文案。

## 本地聚合

把测试模式导出的 JSON 放入本地目录后运行：

```powershell
npm run aggregate:fun-gate -- test-data/fun-gate
```

聚合器会输出会话数、匿名测试者数、结案率、无提示结案率、回放打开率、歧义恢复率、平均耗时和平均提问数。它不会读取案件内容，也不会联网。

## 发布门槛

C01 Fun Gate 需要同时满足：

- 至少 10 位不知道答案的测试者；
- 80% 理解“提问是在验证事实”；
- 70% 在 5–20 分钟内形成正确因果链；
- 60% 无提示完成正式证明；
- 70% 认为满足感主要来自证明过程；
- 语言匹配导致中断不超过 20%；
- 0 次不可逆错误状态；
- 至少 3 人主动尝试备选理论或打开证明回放。

未达标时只修案件、公平性、语义覆盖、反馈和节奏；不把失败数据包装成市场验证。真人评测完成前，案件状态保持 `draft` 或 `internal-rc`。
