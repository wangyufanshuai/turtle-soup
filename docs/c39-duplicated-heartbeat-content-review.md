# 两次相同的心跳 内容审查

- 状态：public-preview / human-evaluation-pending
- 核心机制：回放服务重复播放了同一心跳包；信号源只发送一次，采集、缓存和回放层必须分开核对。
- 推理板：signal-chain + sampling-window
- 事件 / 事实 / 证据：14 / 20 / 14
- 最小证明集合：2
- 语料：220 条；预期歧义 8 条；真人参与：0。
