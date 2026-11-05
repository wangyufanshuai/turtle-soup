# 深汤 · 前端大规模优化规划 + 无服务器部署方案

> 2026-11-05 · 基于 `main@afde0ad` 的源码统计 + 本地静态构建实测（浏览器截图验证）
> 配套文档：[PROJECT-ASSESSMENT-2026-11.md](PROJECT-ASSESSMENT-2026-11.md)

---

## Part 1 · 设计系统审计

### 摘要

**审查范围：** `apps/web` 下 24 个组件、18 个 CSS 文件（约 2,950 行）、首页 + C01 调查页（桌面 1024px / 手机 375px）
**评分：41 / 100**：视觉方向统一，但 token 覆盖率低，组件没有抽象，代码可维护性差。

| 维度 | 得分 | 一句话 |
|---|---:|---|
| 视觉方向 | 8/10 | 暗色档案室 + 暖纸白 + 案件强调色，有辨识度，首页电影感海报效果好 |
| Token 覆盖 | 3/10 | 只定义了 24 个全局 token，却有 365 种不同的硬编码颜色 |
| 字号体系 | 2/10 | 40 多种 font-size，其中 57 处小于等于 10px（最小 6px） |
| 组件抽象 | 3/10 | 159 个裸 `<button>`，没有共享的 Button/Tab/Card 组件 |
| 可维护性 | 2/10 | 182 行超过 400 字符（CSS/TSX 被压成长行）；有死代码 |
| 无障碍 | 6/10 | 211 处 aria-、26 处 focus-visible、支持减少动态；但主导航按钮没有 `role="tab"` |
| 响应式 | 6/10 | 手机单栏 + 底部导航可用；断点混乱 |
| 性能 | 4/10 | 调查页 JS 约 1 MB（已压缩），SW 预取 1,374 个文件 / 17.7 MB |

### 实测发现

**1. 核心体验仍然是最大问题（浏览器实测）。**
在 C01 输入"那个研究员是不是还躲在冷库里"，系统回答"无法识别，请改写"，然后给出两个模板问题。前端怎么优化都绕不开这一点。**提问面板的重设计必须和"AI 主持人"方案一起做**，不要先花大力气重画一个以后会推翻的界面。

**2. 首页和调查页像两个产品。**
首页是写实照片海报（冷藏室走廊，氛围很好），进入案件后变成线框 SVG 示意图，质感落差很大。

**3. 信息密度过高。**
调查页同屏有 4 个步骤 tab（每个带编号 + 副标题）、札记、最近回答、系统提示条、候选问题、"改写问题"、"配置 AI"等入口，和自评里"同一状态只保留一个主动作"的结论一致。

### Token 覆盖

| 类别 | 已定义 | 硬编码 | 建议目标 |
|---|---:|---|---|
| 颜色 | 12 个基础色 + 案件 `--accent` | **544 处 hex（365 种）+ 79 处 rgba** | 约 20 个语义 token（surface/text/border/accent/state 5 组），硬编码 < 20 处 |
| 字号 | 3 个（body/label/meta） | **40+ 种取值**，混用 px / rem / 小数 rem | 7 级字号阶梯，最小 12px |
| 间距 | 3 个（sm/md/lg） | **371 种** padding/margin/gap 组合 | 4px 基准的 8 级间距 |
| 圆角 | 0 | 2/3/4/6/8px 混用 | 3 个（sm 2px / md 4px / full） |
| 层级 z-index | 0 | **25 种取值**（-2 到 200） | 6 个命名层（base/raised/sticky/overlay/modal/toast） |
| 断点 | 0 | 420 / 600 / 850 / 900px | 3 个（sm 600 / md 900 / lg 1200） |

### 组件完整度

| 组件 | 现状 | 状态 | 变体 | 文档 | 得分 |
|---|---|---|---|---|---:|
| Button | 159 处裸 `<button>`，各写各的样式 | ⚠️ | ❌ | ❌ | 3/10 |
| Tab / 步骤导航 | 普通 button，无 `role="tab"` / `aria-selected` | ⚠️ | ⚠️ | ❌ | 4/10 |
| Card / Panel | 每个模块各自定义 | ⚠️ | ❌ | ❌ | 3/10 |
| Input / Textarea | 提问框、札记各自定义 | ✅ | ❌ | ❌ | 5/10 |
| Badge / Tag | 难度、时长、状态各写一套 | ⚠️ | ❌ | ❌ | 3/10 |
| Dialog / Drawer | 设置、札记 | ⚠️ | ❌ | ❌ | 4/10 |

### 代码健康

| 问题 | 位置 | 影响 |
|---|---|---|
| **死代码** | `components/variant-shell.tsx`（320 行）+ `variant-shell.module.css`，没有任何地方引用 | 误导后续修改 |
| 历史壳层套娃 | `game-shell → investigation-shell → legacy-theory-workbench` | 改一处要追三层 |
| 超长单行 | 182 行超过 400 字符，部分 CSS 模块整个文件只有 7–17 行 | 无法 code review，diff 不可读 |
| 单文件过大 | `case-select.module.css` 1,522 行 | 首页样式全堆在一起 |
| 巨型组件 | `investigation-shell.tsx` 462 行 | 状态、布局、业务混在一起 |

---

## Part 2 · 前端优化路线

> **原则：** 不换技术栈（保留 Next.js + CSS Modules + CSS 变量，不迁 Tailwind，避免大面积返工）；先打地基再改界面；每一步都能独立上线。
> ⏰ 考研前最多只做 F0；F2 的提问面板必须等 AI 主持人方案确定。

### F0 · 可读性地基（1–2 天，纯机械，零视觉变化）

1. 引入 Prettier，一次性格式化 `apps/web`（单独一个提交，方便以后 `git blame --ignore-rev`）。
2. 删除 `variant-shell.tsx/.module.css` 等确认没有引用的文件。
3. 加 `stylelint`，规则先只开"禁止新增硬编码颜色 / 小于 12px 的字号"，存量先放过。

**验收：** `npm run check` + `npm run build` 通过；截图和改之前逐像素一致。

### F1 · Design Tokens（3–5 天）

在 `app/tokens.css` 建立完整 token，再批量替换硬编码值。

```css
:root {
  /* 颜色：语义层（引用基础色，不直接写 hex） */
  --color-bg:           #07080a;
  --color-surface-1:    #0b0d10;
  --color-surface-2:    #111318;
  --color-text:         #e8e2d1;
  --color-text-muted:   #8d8a80;
  --color-border:       #2d3035;
  --color-border-strong:#484b50;
  --color-accent:       var(--case-accent, #b8cf79); /* 每案覆盖 */
  --color-danger:       #d56f69;
  --color-warning:      #d2a05d;

  /* 字号：7 级，最小 12px */
  --text-xs: .75rem;   --text-sm: .875rem;  --text-md: 1rem;
  --text-lg: 1.125rem; --text-xl: 1.375rem; --text-2xl: 1.75rem; --text-3xl: 2.5rem;

  /* 间距：4px 基准 */
  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem; --space-4: 1rem;
  --space-6: 1.5rem; --space-8: 2rem;  --space-12: 3rem;  --space-16: 4rem;

  --radius-sm: 2px; --radius-md: 4px; --radius-full: 999px;
  --z-raised: 10; --z-sticky: 20; --z-overlay: 40; --z-modal: 60; --z-toast: 80;
  --dur-fast: 120ms; --dur-base: 200ms; --ease: cubic-bezier(.2,.7,.2,1);
}
```

做法：先把 365 种颜色聚类（色差小于阈值的合并），列成映射表 → 脚本批量替换 → 人工复核差异大的地方。字号同理：6–10px 的一律提到 12px，再检查布局是否溢出。

**验收：** hex 硬编码 < 20 处、字号全部来自 token、关键页面截图人眼对比无回归。

### F2 · 组件库 + 调查页信息架构重设计（1.5–2 周，与 AI 主持人一起）

**1. 抽出 6 个基础组件**（放 `components/ui/`）：

| 组件 | 变体 | 必须覆盖的状态 |
|---|---|---|
| `Button` | primary / secondary / ghost / danger；sm / md | hover、active、focus-visible、disabled、loading |
| `Tabs` | 顶部 / 底部导航两种布局，共用一套逻辑 | `role="tablist/tab/tabpanel"`、方向键切换 |
| `Panel` | default / inset / highlighted | — |
| `Field` | input / textarea | focus、error、字数提示 |
| `Badge` | neutral / accent / warning | — |
| `Sheet` | 右侧抽屉（桌面）/ 底部弹层（手机） | Esc 关闭、焦点锁定、返回焦点 |

**2. 调查页改成"一个主动作"布局：**

```
┌──────────────────────────────────────────────┐
│ ← 案件    冷藏室的敲门声        [札记] [⋯]   │  ← 顶栏只留 2 个入口
├──────────────────────────────────────────────┤
│ 汤面（可折叠）                                │
├──────────────────────────────────────────────┤
│ 问答流（聊天式，AI 主持人回答 是/否/无关）     │  ← 视觉主角
│  你：研究员还躲在冷库里吗？                   │
│  ● 否                         [相关证据 ›]   │
├──────────────────────────────────────────────┤
│ [ 输入你的问题…………………………………… ] [问]        │  ← 唯一主按钮
│  已问 7 次 · 线索 3/8 · [我知道真相了]        │
└──────────────────────────────────────────────┘
证据 / 推断 → 收进侧边抽屉（桌面）或底部 tab（手机），是辅助，不和提问抢注意力
```

- 硬核模式（证明工作台）保留，但作为"我知道真相了 → 提交证明"之后的第二阶段进入，不在开场同时展示。
- 去掉开场的步骤编号副标题、系统提示条、"配置 AI"入口（AI 改由服务端提供）。

**3. 拆巨型组件：** `investigation-shell.tsx` 拆成 `CaseHeader / QuestionStream / QuestionComposer / EvidenceSheet / ProofSheet`，并去掉 `legacy-theory-workbench` 这一层套娃。

### F3 · 视觉统一（1 周）

- **案件场景图和首页统一风格**：首页已经有写实海报（`public/assets/home-cinema`），给每案配一张同风格主图，替换线框 SVG。84 张可以分批：先做 C01/C03/C61/C84 + 每季前 3 案。
- 案件强调色只用在主按钮、进度和关键高亮三个地方，不再到处用。
- 结案页做成可分享的卡片（为后面的分享功能做准备）。

### F4 · 性能（3–4 天）

| 项 | 现状 | 目标 | 做法 |
|---|---|---|---|
| 调查页 JS | 约 1,059 KB | < 350 KB | 用 `@next/bundle-analyzer` 找大块；最大的 429 KB chunk 先拆；证明工作台 / 推理板用 `next/dynamic` 懒加载 |
| SW 预取 | 1,374 文件 / 17.7 MB | 只缓存应用壳 + 已打开的案件 | 改为"进入某案时才缓存该案" |
| 图片 | `public/assets` 13 MB | 每张主图 < 150 KB | 转 AVIF/WebP + `srcset` 多尺寸 |
| 字体 | 依赖系统宋体 | 保持系统字体（中文 webfont 太大） | 不变 |

**验收：** Lighthouse 移动端 Performance ≥ 85，LCP < 2.5s（4G 模拟）。

### F5 · 打磨与验证（持续）

- 键盘全流程（Tab / 方向键 / Esc）、屏幕阅读器读出问答流（`aria-live="polite"`）。
- 用 Playwright 只保留 3 条关键路径 E2E：首页 → 开案 → 提问 → 结案。**不再新增版本化审计脚本。**
- 每个阶段结束都找 3–5 个人实际玩，记录卡点。

### 给 Codex goal 的任务写法（示例）

> **F1 任务：** 在 `apps/web/app/tokens.css` 建立 Part 2 F1 中列出的 token，并把 `apps/web/components/**/*.module.css` 中的硬编码颜色替换成 token。完成标准：① `grep -E '#[0-9a-f]{3,8}'` 在 components 下少于 20 处；② 所有 font-size 都使用 `--text-*`，且没有小于 12px 的值；③ `npm run check` 和 `npm run build` 通过；④ 首页和 C01 调查页在 1440px 与 375px 下截图，放到 PR 描述里。**禁止**新增 `tools/` 脚本、版本 profile 或 docs 报告。

---

## Part 3 · 没有服务器怎么部署

**结论：现阶段根本不需要买服务器。** 当前版本是纯静态站（`next.config.ts` 设置了 `output: "export"`，构建产物在 `apps/web/out`，1,375 个文件、约 21 MB），任何静态托管平台都能直接跑。后面加 AI 主持人，也可以用 Serverless 函数，同样不需要服务器。

### 方案对比

| 平台 | 费用 | 国内访问 | 要备案吗 | 后续能加后端吗 | 推荐度 |
|---|---|---|---|---|---|
| **Cloudflare Pages** | 免费 | 能访问，速度中等，偶有波动 | 不需要 | ✅ Workers + D1 数据库（免费额度） | ⭐⭐⭐⭐⭐ 首选 |
| 腾讯云 EdgeOne Pages | 有免费额度 | 选择"中国大陆加速"时需要已备案的域名；否则走海外节点 | 用大陆加速才需要 | ✅ 边缘函数 | ⭐⭐⭐⭐ 想要国内速度时用 |
| Vercel | 免费 | `*.vercel.app` 在国内经常打不开，需要自定义域名 | 不需要 | ✅ | ⭐⭐⭐ |
| GitHub Pages | 免费 | 慢，不稳定 | 不需要 | ❌ 只能静态 | ⭐⭐ |
| 学生云服务器 | 学生优惠后很便宜 | 好（大陆机房） | 绑域名需要 | ✅ 完全自主 | 等真有需要再买 |

> 各平台的免费额度和政策会变化，部署前以官网当时的说明为准。

### 推荐路径：Cloudflare 全家桶（0 元起步）

```
阶段 0（现在）：Cloudflare Pages 托管 apps/web/out          → 拿到 xxx.pages.dev 网址
阶段 1（考后）：+ Cloudflare Workers 写 /api/ask             → 调用 DeepSeek/通义 API 当主持人
              + D1（托管 SQLite）存提问日志、通关记录
              + Workers Secrets 存模型 API Key（不暴露给前端）
阶段 3（多人）：+ Durable Objects 做房间 / WebSocket
有了稳定玩家以后：再考虑买自己的域名，或迁到国内云 + 备案
```

这条路线从单机到多人都不需要自己运维服务器，也不需要自己配 HTTPS 证书。

### 现在就能做：部署到 Cloudflare Pages（约 15 分钟）

**方式 A：连接 GitHub 自动部署（推荐）**

1. 注册 Cloudflare 账号 → 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**，授权并选择 `wangyufanshuai/turtle-soup`。
2. 构建设置：
   | 项 | 值 |
   |---|---|
   | Production branch | `main` |
   | Build command | `npm ci && npm run build` |
   | Build output directory | `apps/web/out` |
   | 环境变量 | `NODE_VERSION` = `24`（和你本机 v24.22 一致；项目用了 `--experimental-strip-types`，需要较新的 Node）；`TURTLE_SOUP_RELEASE_PROFILE` = `v2.12-internal-rc` |
3. 点 Deploy。之后每次 push 到 `main` 都会自动重新部署，每个 PR 还会生成独立的预览网址。

**方式 B：本地构建后手动上传（不想连 GitHub 时用）**

```bash
npm run build
```

```bash
npx wrangler pages deploy apps/web/out --project-name black-soup
```

（第一次会打开浏览器登录 Cloudflare。）

**部署后自查：**
- 打开 `https://<项目名>.pages.dev/`，进入 C01，刷新页面看能否正常恢复；
- 断网后刷新，验证 PWA 离线是否可用；
- 用手机流量访问一次，感受国内速度。

### 什么时候才需要真服务器？

- 需要大陆访问稳定、速度快，并且愿意备案；
- 需要长时间运行的进程（复杂多人逻辑、定时任务），Serverless 不好做；
- 日活上来后，Serverless 账单超过一台服务器的价格。

真到那一步，可以看阿里云、腾讯云的学生优惠，或者 GitHub Student Developer Pack 里的云服务商赠送额度（用学校邮箱申请）。

---

## Part 4 · 总排期建议

| 时间 | 做什么 |
|---|---|
| **考研前（现在 ~ 12 月底）** | 只做：Cloudflare Pages 上线现有版本（15 分钟）+ 发给 3–5 个朋友试玩。可选 F0（纯格式化 + 删死代码）。 |
| 考后第 1–2 周 | F1 Tokens；同时用 Cloudflare Workers 搭 AI 主持人 API 原型 |
| 考后第 3–4 周 | F2 组件库 + 调查页重设计（和 AI 主持人一起上线"轻松模式"） |
| 考后第 5–6 周 | F3 视觉统一 + F4 性能 |
| 之后 | 每日一汤、分享卡、多人房间 |
