# Rams 启发式设计评分

仅针对当前首页与调查主流程；不是市场分位、游戏好玩程度或代码质量总分。证据见01-evidence.md。本轮无新真人，涉及可理解性/美感的评分是保守专家推断，不冒充用户测试。相同原则取较差实例，0–3整数、等权重。

1. Good design is innovative — Score: 2/3
   Evidence: E1/E6/E7，确定性证据证明与自由总结组合已存在。
   Justification: 改进既有问答/证据板范式；未做五个以上同类产品对比，不能给独创性3分。
2. Good design makes a product useful — Score: 1/3
   Evidence: E2/E3/E6，证明目标有支持，但开场曝光、恢复丢回答和重复组织链损害核心任务。
   Justification: 玩家需要不必要的纠错和组织绕行，不能仅因能显示已结案页面判2或3。
3. Good design is aesthetic — Score: 1/3
   Evidence: E7，间距字号分散、7–9px功能字、accent断连及本轮截图。
   Justification: 有统一暗色方向，但多个可见/源码尺度问题超出两项轻微不一致。
4. Good design makes a product understandable — Score: 1/3
   Evidence: E6，名词是否成立、驱动条件、跨案敲击时间链以及双候选组。
   Justification: 主工作区能辨认，关键命题与证明步骤仍需解释；无人条件下不授予新手实测分。
5. Good design is unobtrusive — Score: 1/3
   Evidence: E6与03/05/08/09，顶部步骤、结构条、次级步骤、候选/建议占据注意力。
   Justification: 提示与结构仍竞争于回答和证据，而非安静退居次要层。
6. Good design is honest — Score: 1/3
   Evidence: E5/E6/E8，“完整流程”“按需下载”“HUMAN_TESTING”“静音”等存在多项口径/行为错配。
   Justification: 有清楚的pending声明且未发现付费/稀缺操纵，但多项错配不满足2分；不推断故意欺骗。
7. Good design is long-lasting — Score: 3/3
   Evidence: E6/E7，文字/档案/证据的语汇、低饱和暗色、系统字体和DOM结构。
   Justification: 视觉语言没有明显追逐短期潮流的标记，长期可用方向值得保留；属设计判断。
8. Good design is thorough down to the last detail — Score: 2/3
   Evidence: E7，各状态与焦点分支均存在，但错误恢复生命周期已出现粗糙边界。
   Justification: 状态覆盖有投入，实证恢复缺陷阻止完整细节分。
9. Good design is environmentally friendly — Score: 1/3
   Evidence: E8，首页脚本673KB，全量SW预取；静态稳态无持续动画且处理减少动态。
   Justification: 对该启发式500KB更高档门槛未达，保守取1；并非断言动画始终开启。
10. Good design is as little design as possible — Score: 1/3
    Evidence: E6，多个同目的建议/候选/步骤入口，旧壳与特殊配置残留。
    Justification: 至少3–5处可合并的展示性入口；不能机械删除可达性入口。

总分：14/30。规则结论：REDESIGN。范围是调查体验的信息组织、公开命题和证明编辑，不是推翻冻结内容、确定性架构或改用AI裁决。
