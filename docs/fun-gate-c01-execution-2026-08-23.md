# C01 正式 Fun Gate 执行记录

日期：2026-08-23  
案件冻结：`turtle-soup-v0.6-2026-08-23`  
浏览器：Playwright CLI + Chromium，`127.0.0.1:3000`  
参与真人数量：0

## 本次已执行的自动化验收

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 冻结清单 | 通过 | `npm run verify:freeze`，12/12 文件哈希一致 |
| C01 首屏可行动 | 通过 | Playwright snapshot 显示现场、提问、证据和因果链三栏 |
| 首次有效提问 | 通过 | 点击“敲门声是人敲的吗？”后出现 1 ASKED 和回答记录 |
| 无法识别问题不改变状态 | 通过 | 输入“有没有人？”后显示“没有改变案件状态”，提问数仍为 1 |
| C01 核心正式通关协议 | 通过 | `npm run check` 中 C01 public command protocol 测试通过 |
| C01 证明回放 | 通过 | 核心测试确认 5 拍 replay 与 100% proof completeness |
| C01 本地存档/投影安全 | 通过 | 核心测试与反泄漏测试通过 |
| 截图审查 | 已保存 | [C01 提问状态截图](../output/playwright/c01-fungate-question-state.png) |

## 尚不能由自动化替代的 Fun Gate 指标

以下指标需要不知道答案的真人，当前没有数据，因此不能标记通过：

- 是否理解“提问是在验证事实”；
- 5–20 分钟内形成正确因果链的比例；
- 无提示正式证明率；
- 满足感是否来自证明过程；
- 语言匹配造成的中断比例；
- 主动尝试备选理论或打开回放的人数。

## 结论

C01 的技术、确定性、公平性和浏览器体验验收通过；正式 Fun Gate 的真人部分状态为 `pending-human-sessions`。本记录不把自动化通关冒充玩家可玩性证据，也不宣称市场验证完成。

下一步：使用 [最终真人评测准备包](./final-human-evaluation-kit.md) 招募至少 10 位不知道答案的测试者，导出本地 JSON/CSV 后运行：

```powershell
npm run aggregate:fun-gate -- test-data/fun-gate
```
