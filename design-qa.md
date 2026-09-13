# 深汤首页 · 电影开场设计 QA（最终）

final result: passed

## Comparison target

- Source visual truth: `E:/xuexi/turtle-soup/output/homepage-cinema-2026-09-07/concepts/01-corridor.png`（用户选定的「走廊纵深」视觉稿）。
- Implementation: `http://127.0.0.1:8139/`，Next.js 静态产物；最终预览保持运行。
- Matched state: 首次进入、第一季、无存档；主视觉与源稿同为 1487 × 1058。
- Implementation screenshot: `output/homepage-cinema-2026-09-07/screenshots/home-1487x1058-final.png`。
- Full-view side-by-side comparison: `output/homepage-cinema-2026-09-07/comparisons/source-vs-final-full.png`。
- Focused comparisons: `comparisons/source-vs-final-hero.png`（标题、正文、主操作）和 `comparisons/source-vs-final-posters.png`（五季海报）。两组均以源图与最终截图同一输入并排生成并实际打开检查。

## Findings

没有可行动的 P0/P1/P2 问题。源稿的全幅走廊纵深、左侧信息层级、冷钢蓝与象牙白、暗红操作色和底部五季海报均在最终实现中保留；DOM 文本由真实可访问内容排版，不依赖源图内文字。

### 五项保真检查

- **字体与排版**：本地 Noto Serif SC 400 用于品牌与中文标题；标题两行结构、字号层级、行高和宋体气质与源稿一致。正文、元信息和导航使用清晰无衬线 UI 字体，中文不截断。
- **间距与布局节奏**：首屏主视觉约七成，标题、元信息、CTA 和海报入口保持源稿的左对齐节奏；桌面目录双列，手机目录单列，海报横向滑动是明确的触控设计。
- **颜色与 token**：深黑背景、冷钢蓝影像、旧象牙白文字和少量暗红 CTA 已统一为首页 token；焦点与状态色有可辨识对比。
- **图片与资产**：主视觉、移动主视觉、五季海报及 84 张逐案封面均为本地图像资源；`art-review/asset-validation.json` 显示 84 案、168 个变体、`allValid: true`、84 个独立 full hash、总计 8,697,898 B。桌面主视觉 111,602 B，移动主视觉 60,048 B，均低于预算；未使用占位图或 CSS 绘图替代目标图片。
- **文案与内容**：品牌统一为「深汤 / THE BLACK SOUP」；案件目录沿用公开题面短钩子；封面不呈现谜底；存档提示、版本说明和离线可玩说明均在页尾。

## Responsive evidence

最终浏览器截图和 `screenshots/responsive-final.json` 覆盖 1487×1058、1440×1024、1280×900、768×1024、390×844、320×720、844×390。每个尺寸均记录：页面无横向溢出（scrollWidth 仅为浏览器滚动条扣除值）、首屏 CTA 完整可见、可见图片无加载失败；横屏 CTA 位于 y=229–280，完全落在 390px 首屏内。

## Interaction and state evidence

- 五季目录真实切换：第一至三季各 12 案，第四、第五季各 24 案；最终目录记录于 `screenshots/seasons-final.json`，首尾路径覆盖 C01–C84。
- 搜索与组合筛选：`冷藏 + 入门 + 未结案` 得到 1 案；不存在的搜索得到 0 案并显示无结果说明；清除后恢复 12 案。筛选面板支持难度、推理技能、档案状态和清除入口，结果通过 `status/aria-live` 暴露。
- 键盘：季节 tab 支持 Home、End、Arrow 导航，焦点可见；截图/状态记录在 `screenshots/keyboard-home-final.txt`、`keyboard-arrow-final.txt`。
- 存档：导入调查中存档后显示「继续调查」与最近调查；导入已结案存档后显示「回看案件」及第一季 1/12；无效包提示不修改已有进度；导出显示「已导出 1 个兼容存档」。状态记录在 `screenshots/archive-*-final.txt`，Blob 下载与 UTF-8/16 MiB 限制由 `archive-io.test.ts` 覆盖。
- 存储不可用：SecurityError fixture 在 390×844 显示「暂时无法读取本地存档」和「重新读取」，季节切换仍可用；证据为 `screenshots/storage-unavailable-final.*`。
- 离线：停止 8139 源站后，已缓存首页及 C84 案件页均成功打开，无连接错误；证据为 `screenshots/offline-home-final.txt`、`offline-c84-final.txt`。84 案全量离线覆盖报告为 `docs/v2.12-check-offline-all-cases.json`（84/84 passed）；`service-worker-offline.test.ts` 验证 Next RSC `_rsc` 缓存命中。

## Build and regression evidence

- `npm run build:v212`：通过；84 个案件路由、90 个静态页面；`docs/v2.12-precache.json`：`passed: true`、1,374 entries、17,682,535 B，缓存名含 manifest hash。
- 回归命令 `node --experimental-strip-types --experimental-transform-types --test apps/web/lib/archive-io.test.ts tools/prepare-static-release.test.ts tools/service-worker-offline.test.ts`：5/5 通过。
- `source-scope-final.json`：packages/mystery-core、content、workers 的 `protectedPaths` 为空；archive-io 仅调整 Blob 下载释放时机，不改变 save envelope、命令协议、案件规则或谜底。

## Patches since previous pass

- 完成剩余 25 张逐案封面并生成压缩 full/thumb 变体，移除临时封面回退。
- 收紧海报遮罩和移动横屏布局，重拍所有目标视口。
- 修正 Service Worker 对 `_rsc` 静态请求的缓存匹配，并让内容哈希变化产生新缓存名。
- 修正存档 Blob 下载在 webview 中过早 revoke 的时序。

## Implementation checklist

- [x] 沉浸式走廊首屏、真实 CTA、全部案件入口
- [x] 五季海报、进度、响应式季节选择
- [x] 84 案独立封面、压缩预算、非泄底题面
- [x] 搜索、筛选、空结果、无障碍状态和键盘操作
- [x] 存档导入/导出、调查中/已结案状态、存储降级
- [x] 桌面、平板、手机竖屏和横屏截图回归
- [x] 静态构建、缓存完整性、离线和必要测试

## Follow-up Polish

P3 可选项：若后续需要继续迭代，可针对并排对比中标题字距或单张海报裁切焦点做定点微调；不影响本轮验收。
