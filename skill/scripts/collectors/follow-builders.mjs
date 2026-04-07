#!/usr/bin/env node
/**
 * 张咋啦 follow-builders 采集器
 * 数据源：github.com/zarazhangrui/follow-builders（每日 06:00 UTC 自动更新的 JSON 文件）
 *
 * 替代原 zara-ai.mjs（静态策展页），直接读取结构化的 feed 数据：
 * - feed-x.json: 25 位 AI builder 的最新推文
 * - feed-podcasts.json: 播客最新集（含完整转录）
 * - feed-blogs.json: 技术博客最新文章
 *
 * 用法：
 *   node follow-builders.mjs                          # 采集 → JSON
 *   node follow-builders.mjs --extract data.json 0,4  # 按序号提取 → Markdown
 */

import { fetchJSON, formatOutput } from "../lib/fetcher.mjs";
import { readFileSync } from "fs";
import { resolve } from "path";

const RAW_BASE = "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main";

async function collect() {
  console.error("🔍 Follow Builders: 采集中...");

  let tweets = { x: [], stats: {} };
  let podcasts = { podcasts: [], stats: {} };
  let blogs = { blogs: [], stats: {} };

  // 并行获取 3 个 feed
  const [tweetsRes, podcastsRes, blogsRes] = await Promise.allSettled([
    fetchJSON(`${RAW_BASE}/feed-x.json`),
    fetchJSON(`${RAW_BASE}/feed-podcasts.json`),
    fetchJSON(`${RAW_BASE}/feed-blogs.json`),
  ]);

  if (tweetsRes.status === "fulfilled") {
    tweets = tweetsRes.value;
    console.error(`  ✅ 推文: ${tweets.stats?.xBuilders || 0} builders, ${tweets.stats?.totalTweets || 0} tweets`);
  } else {
    console.error(`  ⚠️ 推文采集失败: ${tweetsRes.reason?.message}`);
  }

  if (podcastsRes.status === "fulfilled") {
    podcasts = podcastsRes.value;
    console.error(`  ✅ 播客: ${podcasts.stats?.podcastEpisodes || 0} episodes`);
  } else {
    console.error(`  ⚠️ 播客采集失败: ${podcastsRes.reason?.message}`);
  }

  if (blogsRes.status === "fulfilled") {
    blogs = blogsRes.value;
    console.error(`  ✅ 博客: ${blogs.stats?.blogPosts || 0} posts`);
  } else {
    console.error(`  ⚠️ 博客采集失败: ${blogsRes.reason?.message}`);
  }

  // 整理推文：按 builder 分组，每人取互动最高的推文
  const tweetItems = (tweets.x || []).map((builder) => {
    const topTweets = (builder.tweets || [])
      .sort((a, b) => (b.likes + b.retweets) - (a.likes + a.retweets))
      .slice(0, 3);
    return {
      name: builder.name,
      handle: `@${builder.handle}`,
      bio: builder.bio || "",
      topTweets: topTweets.map((t) => ({
        text: t.text?.slice(0, 280) || "",
        likes: t.likes || 0,
        retweets: t.retweets || 0,
        replies: t.replies || 0,
        url: t.url || "",
        createdAt: t.createdAt || "",
      })),
    };
  });

  // 整理播客：提取标题和摘要（不存完整转录）
  const podcastItems = (podcasts.podcasts || []).map((ep) => ({
    name: ep.name || "",
    title: ep.title || "",
    url: ep.url || "",
    publishedAt: ep.publishedAt || "",
    transcriptLength: ep.transcript?.length || 0,
    transcriptPreview: ep.transcript?.slice(0, 500) || "",
  }));

  // 整理博客
  const blogItems = (blogs.blogs || []).map((post) => ({
    title: post.title || "",
    url: post.url || "",
    publishedAt: post.publishedAt || "",
    summary: post.summary || post.content?.slice(0, 300) || "",
  }));

  const allItems = [
    ...tweetItems.map((t) => ({ ...t, category: "推文" })),
    ...podcastItems.map((p) => ({ ...p, category: "播客" })),
    ...blogItems.map((b) => ({ ...b, category: "博客" })),
  ];

  return formatOutput("follow-builders", allItems, {
    generatedAt: tweets.generatedAt || new Date().toISOString(),
    tweets: { count: tweetItems.length, totalTweets: tweets.stats?.totalTweets || 0, items: tweetItems },
    podcasts: { count: podcastItems.length, items: podcastItems },
    blogs: { count: blogItems.length, items: blogItems },
  });
}

function extract(jsonPath, indices) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const selected = indices.map((i) => data.items[i]).filter(Boolean);

  let md = "## Follow Builders 精选\n\n";
  for (const item of selected) {
    if (item.category === "推文") {
      md += `### ${item.name} (${item.handle})\n`;
      for (const t of item.topTweets || []) {
        md += `> ${t.text.slice(0, 200)}...\n`;
        md += `> ❤️${t.likes} 🔁${t.retweets} | [链接](${t.url})\n\n`;
      }
    } else if (item.category === "播客") {
      md += `### [播客] ${item.name}: ${item.title}\n`;
      md += `- [链接](${item.url}) | ${item.publishedAt}\n\n`;
    } else {
      md += `### [博客] ${item.title}\n`;
      md += `- [链接](${item.url})\n\n`;
    }
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
