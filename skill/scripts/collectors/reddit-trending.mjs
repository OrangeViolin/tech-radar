#!/usr/bin/env node
/**
 * Reddit AI/Tech 趋势采集器
 * 数据源：Reddit RSS feed（无需认证，不会被 403）
 *
 * 用法：
 *   node reddit-trending.mjs                          # 采集 top10 → JSON
 *   node reddit-trending.mjs --extract data.json 0,4  # 按序号提取 → Markdown
 */

import { fetchWithRetry, formatOutput } from "../lib/fetcher.mjs";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUBREDDITS = ["artificial", "MachineLearning", "ClaudeAI", "ChatGPT", "LocalLLaMA", "singularity"];

/**
 * 从 RSS XML 中解析帖子
 */
function parseRSS(xml, subreddit) {
  const items = [];
  const entries = xml.split("<entry>").slice(1);

  for (const entry of entries) {
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*\/>/);
    const updatedMatch = entry.match(/<updated>([\s\S]*?)<\/updated>/);
    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);

    // 从 content 中提取 score（Reddit RSS 在 content 中有 "submitted by ... score: N"）
    let score = 0;
    if (contentMatch) {
      // 尝试多种 score 格式
      const scoreMatch = contentMatch[1].match(/(\d+)\s*point/i) ||
                          contentMatch[1].match(/score:\s*(\d+)/i);
      if (scoreMatch) score = parseInt(scoreMatch[1], 10);
    }

    // 从 content 中提取评论数
    let num_comments = 0;
    if (contentMatch) {
      const commMatch = contentMatch[1].match(/(\d+)\s*comment/i);
      if (commMatch) num_comments = parseInt(commMatch[1], 10);
    }

    // 提取实际链接（非 reddit 讨论链接）
    let url = "";
    let permalink = "";
    if (linkMatch) {
      permalink = linkMatch[1];
      // 如果 content 中有外部链接，提取它
      if (contentMatch) {
        const extLink = contentMatch[1].match(/href="(https?:\/\/(?!www\.reddit)[^"]+)"/);
        url = extLink ? extLink[1].replace(/&amp;/g, "&") : permalink;
      } else {
        url = permalink;
      }
    }

    const title = titleMatch ? titleMatch[1]
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\[link\]|\[comments\]/g, "").trim() : "";

    if (title && title !== `${subreddit}`) {
      items.push({
        title,
        subreddit,
        score,
        num_comments,
        url: url || permalink,
        permalink,
        author: "",
        created_utc: updatedMatch ? updatedMatch[1] : "",
      });
    }
  }

  return items;
}

/**
 * 采集单个 subreddit 的 RSS
 */
async function fetchSubreddit(sub) {
  const rssUrl = `https://www.reddit.com/r/${sub}/top.rss?t=day&limit=10`;
  try {
    const xml = await fetchWithRetry(rssUrl, {
      timeout: 15000,
      retries: 2,
      headers: {
        "User-Agent": "tech-radar-bot/1.0 (RSS reader)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
    });
    return parseRSS(xml, sub);
  } catch (err) {
    console.error(`  ⚠️ r/${sub} RSS 采集失败: ${err.message}`);
    return [];
  }
}

/**
 * 主采集函数
 */
async function collect() {
  console.error("🔍 Reddit AI/Tech: 采集中（RSS 模式）...");

  // 并行采集所有 subreddit
  const results = await Promise.all(SUBREDDITS.map(sub => fetchSubreddit(sub)));

  const allPosts = [];
  for (let i = 0; i < SUBREDDITS.length; i++) {
    const posts = results[i];
    if (posts.length > 0) {
      console.error(`  ✅ r/${SUBREDDITS[i]}: ${posts.length} posts`);
      allPosts.push(...posts);
    }
  }

  // Sort by score descending, take top 10
  allPosts.sort((a, b) => b.score - a.score);
  const top10 = allPosts.slice(0, 10).map((item, i) => ({
    rank: i + 1,
    ...item,
  }));

  console.error(`  ✅ Top ${top10.length} posts (from ${allPosts.length} fetched)`);

  return formatOutput("reddit-trending", top10, {
    subreddits: SUBREDDITS,
    totalFetched: allPosts.length,
  });
}

function extract(jsonPath, indices) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const selected = indices.map((i) => data.items[i]).filter(Boolean);

  let md = "## Reddit AI/Tech 热帖\n\n";
  for (const item of selected) {
    md += `### ${item.rank}. [${item.title}](${item.url})\n`;
    md += `- **Subreddit**: r/${item.subreddit} | **Score**: ${item.score} | **Comments**: ${item.num_comments}\n`;
    md += `- [Reddit讨论](${item.permalink})\n`;
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
