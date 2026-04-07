#!/usr/bin/env node
/**
 * Product Hunt 采集器
 * 数据源：producthunt.com/leaderboard (Apollo SSR Data Transport 解析)
 *
 * PH 现在用 Apollo GraphQL cache 而非 __NEXT_DATA__
 * 产品节点格式：{"__typename":"Post","id":"...","name":"...","slug":"...","tagline":"..."}
 * 投票数字段：latestScore / launchDayScore（不是 votesCount）
 *
 * 用法：
 *   node producthunt.mjs                          # 采集当日 top5 + 当月 top20 → JSON
 *   node producthunt.mjs --extract data.json 0,4  # 按序号提取 → Markdown
 */

import { fetchWithRetry, formatOutput, stripHtml } from "../lib/fetcher.mjs";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 从 Apollo SSR cache 中提取 Post 节点
 */
function extractFromApolloCache(html, limit) {
  const items = [];

  // 匹配 "__typename":"Post" 节点 — 这是真实产品数据
  const postPattern = /"__typename":"Post","id":"(\d+)"[^}]*?"name":"([^"]+)","slug":"([^"]+)","tagline":"([^"]+)"/g;
  let match;

  const candidates = [];
  const seenIds = new Set();

  while ((match = postPattern.exec(html))) {
    const id = match[1];
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const name = match[2];
    const slug = match[3];
    const tagline = match[4];
    const pos = match.index;

    // 在 Post 节点附近找 latestScore（PH 的真实投票数字段）
    const nearbyAfter = html.substring(pos, pos + 2000);
    const scoreMatch = nearbyAfter.match(/"latestScore":(\d+)/) ||
                       nearbyAfter.match(/"launchDayScore":(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

    // 找评论数
    const commentsMatch = nearbyAfter.match(/"commentsCount":(\d+)/);
    const commentsCount = commentsMatch ? parseInt(commentsMatch[1], 10) : 0;

    candidates.push({ id, name, slug, tagline, score, commentsCount, pos });
  }

  // 按 score 降序（排行榜逻辑）
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates.slice(0, limit)) {
    items.push({
      rank: items.length + 1,
      name: c.name,
      tagline: c.tagline,
      votesCount: c.score,
      commentsCount: c.commentsCount,
      url: `https://www.producthunt.com/posts/${c.slug}`,
      topics: [],
    });
  }

  return items;
}

/**
 * 从 Product Hunt 排行榜页面解析产品列表
 */
async function fetchLeaderboard(url, limit) {
  const html = await fetchWithRetry(url, { timeout: 20000 });
  return extractFromApolloCache(html, limit);
}

/**
 * 主采集函数
 */
async function collect() {
  console.error("🔍 Product Hunt: 采集中...");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const dailyUrl = `https://www.producthunt.com/leaderboard/daily/${year}/${month}/${day}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayUrl = `https://www.producthunt.com/leaderboard/daily/${yesterday.getFullYear()}/${yesterday.getMonth() + 1}/${yesterday.getDate()}`;
  const monthlyUrl = `https://www.producthunt.com/leaderboard/monthly/${year}/${month}`;

  let daily = [];
  let monthly = [];

  // 日榜：先试今天，空则试昨天
  try {
    daily = await fetchLeaderboard(dailyUrl, 5);
    if (daily.length === 0) {
      console.error("  ⚠️ 今日日榜为空，尝试昨日...");
      daily = await fetchLeaderboard(yesterdayUrl, 5);
    }
    console.error(`  ✅ 日榜 top${daily.length}`);
  } catch (e) {
    console.error(`  ⚠️ 日榜采集失败: ${e.message}`);
  }

  // 月榜
  try {
    monthly = await fetchLeaderboard(monthlyUrl, 20);
    console.error(`  ✅ 月榜 top${monthly.length}`);
  } catch (e) {
    console.error(`  ⚠️ 月榜采集失败: ${e.message}`);
  }

  return formatOutput("producthunt", [], {
    daily: { count: daily.length, items: daily },
    monthly: { count: monthly.length, items: monthly },
  });
}

function extract(jsonPath, indices) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const allItems = [
    ...(data.metadata?.daily?.items || []),
    ...(data.metadata?.monthly?.items || []),
  ];
  const selected = indices.map((i) => allItems[i]).filter(Boolean);

  let md = "## Product Hunt 精选\n\n";
  for (const item of selected) {
    md += `### ${item.rank}. ${item.name}\n`;
    md += `- **Tagline**: ${item.tagline || "N/A"}\n`;
    md += `- **Upvotes**: ${item.votesCount}`;
    if (item.commentsCount) md += ` | **Comments**: ${item.commentsCount}`;
    if (item.url) md += ` | [链接](${item.url})`;
    if (item.topics?.length) md += `\n- **Topics**: ${item.topics.join(", ")}`;
    md += "\n\n";
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
