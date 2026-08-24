# C01 正式 Fun Gate · v1.8 执行手册

状态：`pending-human-sessions`  
版本：`v1.8-internal-rc`  
案件：`C01 / 冷藏室的敲门声`  
真人参与：`0`

## 当前已完成

- v1.8 真相、证明逻辑和发布包已冻结；本评测不修改案件。
- Chromium、Firefox、WebKit 的自动化浏览器门禁已通过。
- 产品内“测试模式”能导出匿名 JSON/CSV。
- 导出不包含原始问题、命令日志、事实、证据 ID、事件 ID、证书或答案文案。
- 已生成 15 个离线批次编号，实际 testerId 以产品导出为准。
- `npm run fun-gate:smoke` 已在 1440×900 与 390×844 的干净 Chromium 上验证首问及 JSON/CSV 下载。
- `npm run fun-gate:clean-context` 已验证：上下文 A 的提问记录不会出现在上下文 B；B 以 0 条公开问答记录启动。

## 需要主持人准备

- 至少 10 位、最好 15 位不知道 C01 答案的测试者。
- 每位测试者使用干净浏览器上下文；一半桌面 1440×900，一半手机 390×844。
- 主持人准备屏幕共享或录屏设备；录制前必须取得单独同意。
- 不把测试者姓名、联系方式或原始录音放入 Git 仓库。

## 无剧透开场词

> 你要调查一件短案件。可以检查现场、提问、整理证据、建立因果链并提交证明。系统回答是在验证事实，不是在直接告诉你答案。请尽量独立完成；我只会记录你卡住的位置，不会提示案件事实。

主持人可以解释按钮和操作方式，但不能提供对象名、问题方向、证据组合、正确理论或证明缺口答案。

## 每场流程

1. 给测试者一个批次编号，不告诉答案。
2. 打开 C01，确认没有旧存档；必要时点击“重新开始案件”。
3. 记录首次有效操作时间。
4. 只观察，不纠正推理。
5. 测试者完成、放弃或达到 25 分钟后，打开“测试模式”导出 JSON 和 CSV。
6. 按 `c01-post-test-interview.md` 访谈，并将观察写入 `observations.csv`；`session_id` 与 `tester_id` 必须和产品 JSON 完全一致。
7. 将 JSON 文件和 `observations.csv` 复制到 `test-data/fun-gate-v1.8/`；访谈记录写入本机私有归档，原始录屏不得进入 Git。

## 必记人工字段

- `understood_question_loop`：第一次回答前是否理解“提问是在验证事实”。
- `formed_correct_causal_chain` 与 `causal_chain_seconds`：测试者首次完整说出正确因果链的时刻；不是正式结案时间。
- `proof_satisfaction_primary` 与 `proof_satisfaction_score`：满足感是否主要来自自己证明，以及 1–5 评分。
- `language_interruption`：是否因语言匹配问题中断，不能把普通歧义恢复记为中断。
- `irreversible_error`：系统是否因错误解释把玩家带入无法撤回的错误状态。
- `attempted_alternative_theory`：是否主动尝试第二种理论；回放行为由产品导出提供。
- `friction_category`：`case / fairness / language / interaction / presentation`。
- 关键原话，必要时脱敏。

产品导出的 `solved`、`hintUseCount`、问题数、重复数、歧义恢复与回放行为不得手工重填。聚合器会严格配对两类记录；缺失、重复或不一致时关闭判定。

## 聚合与门槛

先创建空批次目录：

```powershell
npm run fun-gate:prepare
```

该命令只在观察表不存在时从模板创建 `test-data/fun-gate-v1.8/observations.csv`，不会覆盖已经录入的真人观察。

导入真实导出后运行：

```powershell
npm run aggregate:fun-gate -- test-data/fun-gate-v1.8 docs/v1.8-fun-gate-aggregate.json
```

默认读取 `test-data/fun-gate-v1.8/observations.csv`。也可把第三个参数指定为其他本地观察表路径。聚合报告不包含 tester/session ID、原话或访谈全文。

通过门槛：

- 至少 10 位测试者；
- 80% 理解提问循环；
- 70% 在 5–20 分钟形成正确因果链；
- 60% 无提示完成正式证明；
- 70% 将满足感归因于证明过程；
- 语言匹配中断不超过 20%；
- 0 次不可逆错误状态；
- 至少 3 人主动尝试备选理论或打开回放。

聚合器没有“补全”人工字段的权限；缺失观察必须保持缺失，不能伪造通过。
