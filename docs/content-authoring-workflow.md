# TURTLE SOUP 内容作者工作流 v0.5

案件内容必须按“真相图 → 证明义务 → 公开叙事 → 问题语料 → 对抗审查”的顺序制作。作者不直接从谜面开始写答案，也不让模型裁决事实。

## 标准目录

```text
content/zh/cases/<case-id>.json
content/zh/cases/<case-id>-question-corpus.ts
content/zh/cases/<case-id>.test-vectors.json
docs/<case-id>-content-review.md
docs/content-reports/<case-id>.md
```

## 创建新案

1. 先定义 7–10 个按时间排序的 canonical events。
2. 为每个事件写出可验证 facts、source events 和 evidence。
3. 定义至少两个作者错误理论，并为每个理论定义 hard contradiction。
4. 定义 minimumProofSet、requiredEventOrder 和至少五拍 proofReplay。
5. 写公开谜面和证据观察文案；不得在 opening projection 暴露关键因果链。
6. 为每个查询写 examplePhrases、matchRules 和 visibility gate。
7. 生成不少于 150 条中文语料，包含口语、否定、时间限定、复合问题、无关问题和索要答案的问题。

## 检查命令

```powershell
npm run validate:case -- content/zh/cases/c07-key-returns.json
npm run author:case -- content/zh/cases/c07-key-returns.json
npm run validate:cases
npm run test:core
```

`author:case` 会生成结构指标、语料门槛、覆盖率、回放覆盖率、红鲱鱼和作者待办报告。`validate:cases` 会额外检查案件之间的 ID、hash 和本地化 key 冲突。

## 合并前门槛

- `errors = 0`。
- 查询覆盖率、证明回放覆盖率、必要证据覆盖率、替代理论覆盖率均为 100%。
- 语料不少于 150 条且归一化测试稳定。
- 至少两个错误理论和一个真实但非必要红鲱鱼。
- 核心测试包含完整通关、错误理论、随机证据顺序和投影反泄漏。
- 尚未通过真人评测的案件只能标记为 `draft` 或 `internal-rc`，不能标记 `published`。

