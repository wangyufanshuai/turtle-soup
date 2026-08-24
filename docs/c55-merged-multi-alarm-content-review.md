# 只响一次的多重告警 内容审查

- 状态：public-preview / human-evaluation-pending
- 核心机制：告警队列把同一优先级的多个事件合并为一个声学输出，源事件数量和声音次数不同。
- 推理板：queue-model + state-trace
- 事件 / 事实 / 证据：10 / 16 / 10
- 最小证明集合：2
- 语料：220 条；预期歧义 8 条；真人参与：0。
