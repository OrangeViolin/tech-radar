---
name: tech-radar
description: 科技情报雷达。5源并行采集（GitHub Trending / Product Hunt / Hacker News / 张咋啦AI / Follow Builders），AI 分析师独立研判，主编跨源综合，输出日报。触发词："/tech-radar"、"科技雷达"、"今日科技"、"tech radar"、"看看热榜"、"GitHub 热榜"、"PH 排行"、"HN 热帖"
---

# 科技雷达 Tech Radar

4 个数据源并行采集，4 个 AI 分析师各写报告，1 个主编跨源综合。

## 三层流水线架构

```
Layer 1: 脚本采集（Node.js，不耗 AI token，~10秒）
         ↓ 4 个 JSON
Layer 2: 4 个 AI 分析师并行分析（各读各的 prompt + 数据）
         ↓ 4 份独立报告
Layer 3: 主编综合（跨源关联 + 趋势判断 + 30秒速读）
         ↓ 1 份最终日报
```

## 数据源

| 源 | 采集脚本 | 数据 |
|----|---------|------|
| GitHub Trending | `gh-trending.mjs` | 日榜增速 top5 + 月榜增速 top20 |
| Product Hunt | `producthunt.mjs` | 日榜 top5 + 月榜 top20 |
| Hacker News | `hackernews.mjs` | Top 30 stories |
| 张咋啦 AI | `zara-ai.mjs` | 视频/播客更新检测 |
| Follow Builders | `follow-builders.mjs` | AI builder 推文/播客/博客（张咋啦 follow-builders 仓库） |

## 触发词

| 触发词 | 说明 |
|--------|------|
| `/tech-radar` | 完整流水线：采集 → 分析 → 综合日报 |
| "科技雷达" | 同上 |
| "今日科技" | 同上 |
| "看看热榜" | 同上 |
| `/tech-radar github` | 只看 GitHub Trending |
| `/tech-radar ph` | 只看 Product Hunt |
| `/tech-radar hn` | 只看 Hacker News |
| `/tech-radar zara` | 只看张咋啦推荐 |
| "GitHub 热榜" | 只采集并分析 GitHub |
| "PH 排行" | 只采集并分析 Product Hunt |
| "HN 热帖" | 只采集并分析 Hacker News |

## 执行流程

### 变量定义

```
SKILL_DIR = 本 SKILL.md 所在目录的绝对路径
SCRIPTS_DIR = ${SKILL_DIR}/scripts
COLLECTORS_DIR = ${SCRIPTS_DIR}/collectors
ANALYSIS_DIR = ${SKILL_DIR}/analysis
RADAR_HOME = /home/01fish/TT/项目1：01fish-assistant/tech-radar
OUTPUT_DIR = ${RADAR_HOME}/reports/$(date +%Y-%m-%d)
```

### Step 1: 采集（Layer 1 — 纯脚本，不耗 token）

判断用户是要完整采集还是单源：

**完整采集：**

```bash
mkdir -p "${OUTPUT_DIR}"
node "${SCRIPTS_DIR}/collect.mjs" --output "${OUTPUT_DIR}"
```

协调器会自动发现 `collectors/` 目录下所有 `.mjs` 文件并行执行。

**单源采集：**

```bash
mkdir -p "${OUTPUT_DIR}"
node "${COLLECTORS_DIR}/<采集器名>.mjs" > "${OUTPUT_DIR}/<源名>.json"
```

采集器映射：
- `github` → `gh-trending.mjs`
- `ph` → `producthunt.mjs`
- `hn` → `hackernews.mjs`
- `zara` → `zara-ai.mjs`

### Step 2: 分析（Layer 2 — AI 分析师）

对每个成功采集的数据源：

1. 读取对应的分析师 prompt：`${ANALYSIS_DIR}/<源名>-analyst.md`
2. 读取采集数据：`${OUTPUT_DIR}/<源名>.json`（或从 summary.json 中提取对应源的数据）
3. 按 prompt 要求分析数据，生成独立报告

分析师 prompt 映射：
- `gh-trending.json` → `github-analyst.md`
- `producthunt.json` → `producthunt-analyst.md`
- `hackernews.json` → `hackernews-analyst.md`
- `zara-ai.json` → `zara-analyst.md`

**重要：4 个分析师互相独立，可以用 4 个并行 Agent 同时运行。**

### Step 3: 综合（Layer 3 — 主编）

仅在完整采集模式下执行：

1. 读取主编 prompt：`${ANALYSIS_DIR}/synthesizer.md`
2. 汇总所有分析师报告
3. 执行跨源关联分析
4. 生成最终日报，以「30 秒速读」开头

### Step 4: 输出

日报文件名为当天日期：`${OUTPUT_DIR}/YYYY-MM-DD.md`（如 `2026-04-03.md`）。

**日报必须包含以下完整内容：**

#### Part 1: 30 秒速读（3 条核心趋势 + 行动建议）

#### Part 2: 原始榜单数据
必须完整列出以下原始数据，不可省略：
- **GitHub Trending 日榜（增速）**：所有条目（仓库名、描述、语言、Star 数、当日增量）
- **GitHub Trending 月榜（增速）**：所有条目（同上，月增量）
- **GitHub 总星数 Top10（日榜）**：按总 Star 数排序的当日 trending 前 10（如日榜不足 10 条则展示全部）
- **GitHub 总星数 Top10（月榜）**：按总 Star 数排序的当月 trending 前 10
- **Product Hunt 日榜 Top5**：产品名、Tagline、投票数、评论数、链接
- **Product Hunt 月榜 Top20**：同上
- **Hacker News Top 30**：标题、分数、评论数、链接
- **张咋啦 AI 更新**：新增视频/播客（如无更新标注"无变化"）
- **Follow Builders**：AI builder 最新推文精选（互动最高的）+ 最新播客/博客

**重要：每一条信息都必须附带一句"01fish 行动建议"**，说明是否值得关注以及如何利用这条信息（写文章？用工具？跟踪观察？忽略？）。不要只罗列数据。

#### Part 3: 跨源强信号分析
同一话题/实体出现在多个源的，做关联分析。

#### Part 4: 选题建议
结合 01fish 内容特点给出选题建议：
- **01fish 内容定位**：AI 自媒体教育博主，讲"AI 改变普通人的故事"，风格好奇、专业、有温度、技术幽默
- **内容标准**：有用（能学到东西）+ 有趣（有钩子、有故事性）
- **优先角度**：AI + 普通人视角 > 纯技术视角；实操教程 > 抽象分析；反常识/争议 > 平铺直叙
- **标题钩子**：必须有反常识、具体冲突、悬念或数字冲击中的至少一种
- 每条选题给出：标题草案（含钩子）、内容角度、目标平台、为什么现在做

#### Part 5: 观察列表
持续跟踪的信号。

**保存路径：** `${OUTPUT_DIR}/YYYY-MM-DD.md`，同时在对话中完整展示给用户。

如果是单源模式，直接展示该源的原始数据 + 分析报告，不做跨源综合。

### Step 5: 处理 fish 点评

当用户说"处理点评"或"看看我的点评"时：

1. 读取当天日报 md 文件
2. 扫描所有 `fish点评:` 标记（用户会在日报任意位置插入）
3. 理解每条点评的上下文（它写在哪条数据旁边）和意图
4. 逐条执行：
   - 如果是**行动指令**（"这个要做"、"试一下"、"写篇文章"）→ 直接执行或创建具体任务
   - 如果是**委派**（"找人测"、"让助理做"）→ 记录到待办
   - 如果是**素材标记**（"引用到xx文章"、"可以用"）→ 收集到素材库
   - 如果是**想法/灵感**（"有意思"、"可以结合xx"）→ 用 /bi 存入大脑收件箱
   - 如果是**否定**（"没用"、"忽略"）→ 跳过
5. 处理完后，在日报末尾追加「点评处理记录」，汇总执行了什么

**触发词**："处理点评"、"看看我的点评"、"执行点评"

## 扩展数据源

加新源只需两步：
1. 复制 `collectors/` 下任意 `.mjs` 文件改名，实现采集逻辑
2. 在 `analysis/` 下新建对应的 `xxx-analyst.md` 分析师 prompt

协调器会自动发现新文件，不需要改任何配置。

## 文件结构

```
.claude/skills/tech-radar/
├── SKILL.md                        # 本文件（Skill 入口）
├── analysis/                       # 分析师 prompt（独立可调）
│   ├── github-analyst.md
│   ├── producthunt-analyst.md
│   ├── hackernews-analyst.md
│   ├── zara-analyst.md
│   └── synthesizer.md              # 主编综合 prompt
└── scripts/
    ├── collect.mjs                 # 协调器
    ├── collectors/
    │   ├── gh-trending.mjs
    │   ├── producthunt.mjs
    │   ├── hackernews.mjs
    │   └── zara-ai.mjs
    └── lib/
        └── fetcher.mjs             # HTTP + 公共工具
```
