# Tech Radar — 科技情报雷达

> 7 源并行采集 → AI 分析师独立研判 → 主编跨源综合 → 每日情报日报

Tech Radar 是一个 Claude Code Skill，为 AI 自媒体创作者 01fish 提供每日科技情报。它通过三层流水线架构，自动采集多个科技信息源的数据，由 AI 分析师独立研判，最终由主编综合输出一份可直接指导内容创作的日报。

---

## 快速开始

### 前置条件

- [Claude Code](https://claude.com/claude-code) CLI 已安装
- Node.js >= 18
- 网络可访问 GitHub / Hacker News / Product Hunt / Reddit 等站点

### 安装

将 `skill/` 目录链接或复制到 Claude Code 的 skills 目录：

```bash
# 方式 1：符号链接（推荐，保持同步）
ln -s /path/to/tech-radar/skill ~/.claude/skills/tech-radar

# 方式 2：直接复制
cp -r /path/to/tech-radar/skill ~/.claude/skills/tech-radar
```

### 验证安装

在 Claude Code 中输入：

```
/tech-radar
```

如果看到采集器开始运行并输出日报，说明安装成功。

---

## 使用方式

### 在 Claude Code 中调用

| 命令 / 触发词 | 说明 |
|---------------|------|
| `/tech-radar` | 完整流水线：采集全部 7 源 → 分析 → 综合日报 |
| `科技雷达` / `今日科技` / `看看热榜` | 同上（自然语言触发） |
| `/tech-radar github` | 只采集并分析 GitHub Trending |
| `/tech-radar ph` | 只采集并分析 Product Hunt |
| `/tech-radar hn` | 只采集并分析 Hacker News |
| `/tech-radar zara` | 只采集并分析张咋啦 AI 推荐 |
| `/tech-radar reddit` | 只采集并分析 Reddit AI/Tech |
| `/tech-radar polymarket` | 只采集并分析 Polymarket 预测市场 |
| `/tech-radar builders` | 只采集并分析 Follow Builders |
| `GitHub 热榜` | 只看 GitHub |
| `PH 排行` | 只看 Product Hunt |
| `HN 热帖` | 只看 Hacker News |

### 处理点评

日报生成后，你可以在日报的任意位置插入 `fish点评:` 标记来批注。然后：

```
处理点评
```

系统会自动扫描所有点评并分类执行：行动指令直接执行、素材标记收集到素材库、想法灵感存入大脑收件箱。

### 直接运行采集脚本（不通过 Claude Code）

```bash
# 运行全部采集器，结果输出到 reports/ 目录
node skill/scripts/collect.mjs --output reports/$(date +%Y-%m-%d)

# 只运行指定采集器
node skill/scripts/collect.mjs gh-trending --output reports/$(date +%Y-%m-%d)

# 运行单个采集器，输出到 stdout
node skill/scripts/collectors/gh-trending.mjs
node skill/scripts/collectors/hackernews.mjs
node skill/scripts/collectors/producthunt.mjs
node skill/scripts/collectors/zara-ai.mjs
node skill/scripts/collectors/reddit-trending.mjs
node skill/scripts/collectors/polymarket-trending.mjs
node skill/scripts/collectors/follow-builders.mjs
```

每个采集器还支持 `--extract` 模式，从已采集的 JSON 中提取指定条目为 Markdown：

```bash
# 提取第 1、3、5 条（序号从 0 开始）
node skill/scripts/collectors/gh-trending.mjs --extract reports/2026-04-06/gh-trending.json 0,2,4
```

---

## 三层流水线架构

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: 脚本采集（Node.js，不耗 AI token，~10 秒）        │
│                                                         │
│  gh-trending ─┐                                         │
│  producthunt ─┤                                         │
│  hackernews  ─┤── collect.mjs 协调器 ──→ 7 个 JSON 文件   │
│  zara-ai     ─┤       (并行执行)                         │
│  reddit      ─┤                                         │
│  polymarket  ─┤                                         │
│  follow-bld  ─┘                                         │
└─────────────────────────┬───────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: AI 分析师并行分析（各读各的 prompt + 数据）        │
│                                                         │
│  github-analyst.md ──→ GitHub 分析报告                    │
│  producthunt-analyst.md ──→ PH 分析报告                   │
│  hackernews-analyst.md ──→ HN 分析报告                    │
│  zara-analyst.md ──→ 张咋啦分析报告                       │
│  (4 个 Agent 并行运行)                                    │
└─────────────────────────┬───────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: 主编综合（synthesizer.md）                       │
│                                                         │
│  汇总所有报告 → 跨源关联 → 选题建议 → 最终日报              │
└─────────────────────────────────────────────────────────┘
```

### 为什么分三层？

- **Layer 1 纯脚本**：不消耗 AI token，可以独立调试，数据可复用
- **Layer 2 并行分析**：4 个分析师互不依赖，通过并行 Agent 同时运行，速度快
- **Layer 3 综合**：只有主编能看到全局，做跨源关联和选题推荐

---

## 数据源详情

| # | 数据源 | 采集方式 | 数据内容 | 采集脚本 |
|---|--------|---------|---------|---------|
| 1 | GitHub Trending | HTML 解析 + OSS Insight API | 日榜 top5（增速）+ 月榜 top20（增速） | `gh-trending.mjs` |
| 2 | Product Hunt | 排行榜页面解析 | 日榜 top5 + 月榜 top20 | `producthunt.mjs` |
| 3 | Hacker News | Firebase 官方 API | Top 30 stories | `hackernews.mjs` |
| 4 | 张咋啦 AI | zara.faces.site 页面解析 | 视频/关注/工具推荐 | `zara-ai.mjs` |
| 5 | Reddit AI/Tech | Reddit 公共 JSON API | 6 个 AI subreddit Top 10 热帖 | `reddit-trending.mjs` |
| 6 | Polymarket | Gamma API | AI/Tech 预测市场 Top 10 | `polymarket-trending.mjs` |
| 7 | Follow Builders | GitHub Raw 文件 | AI builder 推文/播客/博客 | `follow-builders.mjs` |

---

## 日报输出格式

完整日报包含 5 个部分：

| 部分 | 内容 |
|------|------|
| **Part 1: 30 秒速读** | 3 条核心趋势 + 行动建议 |
| **Part 2: 原始榜单** | 所有数据源的完整原始数据，每条附带 01fish 行动建议 |
| **Part 3: 跨源强信号** | 同一话题出现在多个源的关联分析 |
| **Part 4: 选题建议** | 3-5 条结合 01fish 定位的选题（含标题草案、角度、平台） |
| **Part 5: 观察列表** | 持续跟踪的信号 |

日报保存路径：`reports/YYYY-MM-DD/YYYY-MM-DD.md`

---

## 目录结构

```
tech-radar/
├── README.md                              # 本文件
├── skill/                                 # Skill 完整源码
│   ├── SKILL.md                           # Skill 入口定义（Claude Code 读取）
│   ├── .snapshots/                        # 变更检测快照
│   │   └── zara-ai-snapshot.json
│   ├── analysis/                          # AI 分析师 prompt
│   │   ├── github-analyst.md              # GitHub 趋势分析师
│   │   ├── producthunt-analyst.md         # Product Hunt 分析师
│   │   ├── hackernews-analyst.md          # Hacker News 分析师
│   │   ├── zara-analyst.md                # 张咋啦推荐分析师
│   │   └── synthesizer.md                 # 主编综合 prompt
│   └── scripts/
│       ├── collect.mjs                    # 采集协调器（自动发现并行执行）
│       ├── fetch_wechat_article.py        # 公众号文章抓取（辅助工具）
│       ├── collectors/                    # 各数据源采集器
│       │   ├── gh-trending.mjs            # GitHub Trending
│       │   ├── producthunt.mjs            # Product Hunt
│       │   ├── hackernews.mjs             # Hacker News
│       │   ├── zara-ai.mjs               # 张咋啦 AI
│       │   ├── reddit-trending.mjs        # Reddit AI/Tech
│       │   ├── polymarket-trending.mjs    # Polymarket 预测市场
│       │   └── follow-builders.mjs        # Follow Builders
│       └── lib/
│           └── fetcher.mjs                # 公共 HTTP 工具（fetch + 重试 + 超时）
└── reports/                               # 采集数据 + 日报存档
    └── YYYY-MM-DD/
        ├── YYYY-MM-DD.md                  # 综合日报
        ├── summary.json                   # 采集汇总
        ├── gh-trending.json               # GitHub 原始数据
        ├── hackernews.json                # HN 原始数据
        ├── producthunt.json               # PH 原始数据
        ├── zara-ai.json                   # 张咋啦原始数据
        └── follow-builders.json           # Builders 原始数据
```

---

## 扩展新数据源

只需两步，无需修改任何配置：

**Step 1**：在 `skill/scripts/collectors/` 下新建 `your-source.mjs`

```javascript
import { fetchJSON, formatOutput } from "../lib/fetcher.mjs";

async function collect() {
  const data = await fetchJSON("https://api.example.com/data");
  const items = data.map((item, i) => ({
    rank: i + 1,
    title: item.title,
    url: item.url,
    // ...其他字段
  }));
  return formatOutput("your-source", items);
}

const result = await collect();
console.log(JSON.stringify(result, null, 2));
```

**Step 2**：在 `skill/analysis/` 下新建 `your-source-analyst.md`

```markdown
# Your Source 分析师

## 角色
你是 xxx 分析师...

## 输入
你会收到 xxx 的 JSON 数据...

## 输出格式
...
```

协调器 `collect.mjs` 会自动发现新的采集器文件并并行执行。

---

## 公共工具库

`lib/fetcher.mjs` 提供以下工具函数：

| 函数 | 说明 |
|------|------|
| `fetchWithRetry(url, opts)` | 带超时重试的 HTTP 请求（默认 15s 超时，2 次重试） |
| `fetchJSON(url, opts)` | fetch + JSON 解析 |
| `formatOutput(source, items, metadata)` | 统一输出格式：`{ source, timestamp, count, metadata, items }` |
| `stripHtml(html)` | 简单 HTML 标签清理 |

---

## 已知问题

- Product Hunt 采集器偶尔返回空数据，页面结构变化时需更新解析逻辑
- GitHub HTML 解析依赖页面结构，如 GitHub 改版需更新正则
- 张咋啦页面为静态策展，视频/产品数据提取需优化

---

## 参考

- 架构灵感：[给 claude code 装了个情报中心](https://mp.weixin.qq.com/s/aAt4c5HW8nAWsnXjQ2DsKA)（想象力AI / 阿涵）
- 参考仓库：[Aster110/mycc](https://github.com/Aster110/mycc)
