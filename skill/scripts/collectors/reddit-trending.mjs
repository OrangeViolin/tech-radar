#!/usr/bin/env node
/**
 * Reddit AI/Tech 趋势采集器
 * 数据源：Reddit 公共 JSON API（无需认证）
 *
 * 用法：
 *   node reddit-trending.mjs                          # 采集 top10 → JSON
 *   node reddit-trending.mjs --extract data.json 0,4  # 按序号提取 → Markdown
 */

import { fetchJSON, formatOutput } from "../lib/fetcher.mjs";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUBREDDITS = "artificial+MachineLearning+ClaudeAI+ChatGPT+LocalLLaMA+singularity";
const REDDIT_URL = `https://www.reddit.com/r/${SUBREDDITS}.json?limit=30&t=day`;

/**
 * 主采集函数
 */
async function collect() {
  console.error("🔍 Reddit AI/Tech: 采集中...");

  const data = await fetchJSON(REDDIT_URL, {
    timeout: 15000,
    retries: 2,
    headers: {
      "User-Agent": "tech-radar-bot/1.0 (collecting AI/tech trends)",
      "Accept": "application/json",
    },
  });

  const posts = (data?.data?.children || [])
    .filter((child) => child.kind === "t3" && child.data)
    .map((child) => {
      const d = child.data;
      return {
        title: d.title || "",
        subreddit: d.subreddit || "",
        score: d.score || 0,
        num_comments: d.num_comments || 0,
        url: d.url || "",
        permalink: `https://www.reddit.com${d.permalink}`,
        author: d.author || "",
        created_utc: d.created_utc
          ? new Date(d.created_utc * 1000).toISOString()
          : "",
      };
    });

  // Sort by score descending, take top 10
  posts.sort((a, b) => b.score - a.score);
  const top10 = posts.slice(0, 10).map((item, i) => ({
    rank: i + 1,
    ...item,
  }));

  console.error(`  ✅ Top ${top10.length} posts (from ${posts.length} fetched)`);

  return formatOutput("reddit-trending", top10, {
    subreddits: SUBREDDITS,
    totalFetched: posts.length,
  });
}

function extract(jsonPath, indices) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const selected = indices.map((i) => data.items[i]).filter(Boolean);

  let md = "## Reddit AI/Tech 热帖\n\n";
  for (const item of selected) {
    md += `### ${item.rank}. [${item.title}](${item.url})\n`;
    md += `- **Subreddit**: r/${item.subreddit} | **Score**: ${item.score} | **Comments**: ${item.num_comments}\n`;
    md += `- [Reddit讨论](${item.permalink}) | **Author**: u/${item.author}\n`;
    md += `- **Time**: ${item.created_utc}\n\n`;
  }
  return md;
}

const args = process.argv.slice(2);

if (args[0] === "--extract" && args[1]) {
  const indices = (args[2] || "0").split(",").map(Number);
  console.log(extract(resolve(args[1]), indices));
} else {
  const result = await collect();
  console.log(JSON.stringify(result, null, 2));
}
