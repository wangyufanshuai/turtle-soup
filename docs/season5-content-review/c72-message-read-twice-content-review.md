# 一封被两次读出的通知 内容审查

- 状态：internal-rc / human-evaluation-pending
- 核心机制：一次发送在客户端确认丢失后重试投递到两个终端，阅读次数和发送次数不是同一计数。
- 推理板：queue-model + provenance-chain
- 事件 / 事实 / 证据：12 / 20 / 12
- 最小证明集合：2
- 语料：220 条；预期歧义 8 条；真人参与：0。
