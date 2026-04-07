# Tech Radar — 科技情报雷达

4 源并行采集 → AI 分析师独立研判 → 主编跨源综合 → 每日情报日报

## 目录结构

```
tech-radar/
├── README.md              # 本文件
├── skill/                 # Skill 完整源码（与 ~/.claude/skills/tech-radar/ 同步）
│   ├── SKILL.md           # Skill 入口定义
│   ├── analysis/          # 4 个分析师 + 1 个主编 prompt
│   │   ├── github-analyst.md
│   │   ├── producthunt-analyst.md
│   │   ├── hackernews-analyst.md
│   │   ├── zara-analyst.md
│   │   └── synthesizer.md
│   └── scripts/
│       ├── collect.mjs                # 协调器
│       ├── fetch_wechat_article.py    # 公众号抓取脚本（从 mycc 仓库补全）
│       ├── collectors/
│       │   ├── gh-trending.mjs        # GitHub Trending
│       │   ├── producthunt.mjs        # Product Hunt
│       │   ├── hackernews.mjs         # Hacker News
│       │   └── zara-ai.mjs           # 张咋啦 AI 推荐
│       └── lib/
│           └── fetcher.mjs            # 公共 HTTP 工具
├── reports/               # 采集数据 + 日报存档
│   ├── daily-report.md    # 综合日报
│   ├── summary.json       # 采集汇总
│   ├── gh-trending.json   # GitHub 原始数据
│   ├── hackernews.json    # HN 原始数据
│   ├── producthunt.json   # PH 原始数据
│   └── zara-ai.json       # 张咋啦原始数据
└── research/              # 调研资料（备用）
```

## 数据源

| 源 | API/方式 | 数据内容 |
|----|---------|---------|
| GitHub Trending | HTML 解析 + OSS Insight API | 日榜 top5 + 月榜 top20 |
| Product Hunt | 排行榜页面解析 | 日榜 top5 + 月榜 top20 |
| Hacker News | Firebase 官方 API | Top 30 stories |
| 张咋啦 AI | zara.faces.site/ai 页面解析 | 视频/关注/工具推荐 |

## 使用

在 Claude Code 中：
- `/tech-radar` — 完整流水线
- `/tech-radar github` — 只看 GitHub
- `/tech-radar hn` — 只看 Hacker News
- "看看热榜" / "科技雷达" — 同完整流水线

## 参考

- 架构灵感：[给 claude code 装了个情报中心](https://mp.weixin.qq.com/s/aAt4c5HW8nAWsnXjQ2DsKA)（想象力AI / 阿涵）
- 参考仓库：[Aster110/mycc](https://github.com/Aster110/mycc)

## 已知问题

- Product Hunt 采集器返回空数据（2026-04-03），页面结构可能变化，需优化解析逻辑
- GitHub HTML 解析依赖页面结构，如 GitHub 改版需更新正则
- 张咋啦页面为静态策展，视频/产品数据提取需优化
