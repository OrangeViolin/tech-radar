#!/usr/bin/env node
/**
 * Hacker News 采集器
 * 数据源：HN Firebase API (JSON)
 *
 * 用法：
 *   node hackernews.mjs                          # 采集 top30 → JSON
 *   node hackernews.mjs --extract data.json 0,4  # 按序号提取 → Markdown
 */

import { fetchJSON, formatOutput } from "../lib/fetcher.mjs";
import { readFileSync } from "fs";
import { resolve } from "path";

const HN_API = "https://hacker-news.firebaseio.com/v0";

/**
 * 获取单条 story 详情
 */
async function fetchItem(id) {
  try {
    return await fetchJSON(`${HN_API}/item/${id}.json`, { timeout: 8000, retries: 1 });
  } catch {
    return null;
  }
}

/**
 * 主采集函数
 */
async function collect() {
  console.error("🔍 Hacker News: 采集中...");

  // 获取 top stories ID 列表
  const topIds = await fetchJSON(`${HN_API}/topstories.json`);
  const top30Ids = topIds.slice(0, 30);

  // 并行获取详情（分批，每批 10 个）
  const items = [];
  for (let i = 0; i < top30Ids.length; i += 10) {
    const batch = top30Ids.slice(i, i + 10);
    const results = await Promise.all(batch.map(fetchItem));
    for (const item of results) {
      if (item && item.type === "story") {
        items.push({
          rank: items.length + 1,
          id: item.id,
          title: item.title || "",
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          author: item.by || "",
          comments: item.descendants || 0,
          time: new Date(item.time * 1000).toISOString(),
        });
      }
    }
  }

  console.error(`  ✅ Top ${items.length} stories`);

  return formatOutput("hackernews", items, {
    topStories: { count: items.length },
  });
}

function extract(jsonPath, indices) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const selected = indices.map((i) => data.items[i]).filter(Boolean);

  let md = "## Hacker News 精选\n\n";
  for (const item of selected) {
    md += `### ${item.rank}. [${item.title}](${item.url})\n`;
    md += `- **Points**: ${item.score} | **Comments**: ${item.comments}`;
    md += ` | [HN讨论](${item.hnUrl})\n`;
    md += `- **Author**: ${item.author} | **Time**: ${item.time}\n\n`;
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
