# 失效后仍能开的权限 内容审查

- 状态：internal-rc / human-evaluation-pending
- 核心机制：撤销消息仍在同步队列中，门禁使用本地旧权限缓存；权限失效时间与门锁接收时间分离。
- 推理板：network-topology + causal-graph
- 事件 / 事实 / 证据：11 / 19 / 11
- 最小证明集合：2
- 语料：220 条；预期歧义 8 条；真人参与：0。
