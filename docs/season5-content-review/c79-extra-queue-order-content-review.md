# 队列里多出的订单 内容审查

- 状态：internal-rc / human-evaluation-pending
- 核心机制：确认包丢失后客户端重试，业务层采用至少一次提交；订单记录可重复而库存实体不重复。
- 推理板：capacity-model + queue-model
- 事件 / 事实 / 证据：14 / 22 / 14
- 最小证明集合：2
- 语料：220 条；预期歧义 8 条；真人参与：0。
