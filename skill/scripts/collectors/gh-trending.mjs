#!/usr/bin/env node
/**
 * GitHub Trending 采集器
 * 数据源：github.com/trending (HTML 解析) + OSS Insight API (JSON)
 *
 * 用法：
 *   node gh-trending.mjs                          # 采集当日 top5 + 当月 top20 → JSON
 *   node gh-trending.mjs --extract data.json 0,4  # 按序号提取条目 → Markdown
 */

import { fetchWithRetry, fetchJSON, formatOutput, stripHtml } from "../lib/fetcher.mjs";
import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

const OSS_INSIGHT_BASE = "https://api.ossinsight.io/v1/trends/repos/";
const GH_TRENDING_URL = "https://github.com/trending";

/**
 * 从 OSS Insight API 采集（推荐，结构化 JSON）
 */
async function fetchFromOSSInsight(period = "past_24_hours", limit = 5) {
  try {
    const data = await fetchJSON(
      `${OSS_INSIGHT_BASE}?period=${period}&language=All`
    );
    const repos = (data.data || []).slice(0, limit);
    return repos.map((r, i) => ({
      rank: i + 1,
      name: r.repo_name,
      description: r.description || "",
      language: r.primary_language || "N/A",
      stars: r.stars || 0,
      forks: r.forks || 0,
      score: r.total_score || 0,
      url: `https://github.com/${r.repo_name}`,
    }));
  } catch {
    return null; // 降级到 HTML 解析
  }
}

/**
 * 从 GitHub Trending 页面 HTML 解析（降级方案）
 */
async function fetchFromHTML(since = "daily", limit = 25) {
  const url = `${GH_TRENDING_URL}?since=${since}`;
  const html = await fetchWithRetry(url);

  const items = [];
  // 匹配每个 repo 行
  // GitHub 可能用不同的 class 名，尝试多种分割方式
  let repoBlocks = html.split('<article class="Box-row">').slice(1);
  if (repoBlocks.length === 0) {
    repoBlocks = html.split(/class="[^"]*Box-row[^"]*"/).slice(1);
  }

  for (const block of repoBlocks.slice(0, limit)) {
    // 仓库名：必须匹配 owner/repo 格式（排除 login、sponsors、orgs 等路径）
    const allHrefs = [...block.matchAll(/href="\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"/g)];
    const nameMatch = allHrefs.find(m =>
      !m[1].startsWith("sponsors/") &&
      !m[1].startsWith("login/") &&
      !m[1].startsWith("orgs/") &&
      !m[1].includes("/stargazers") &&
      !m[1].includes("/network")
    );
    const name = nameMatch ? nameMatch[1].trim() : "";

    // 描述
    const descMatch = block.match(/<p class="[^"]*col-9[^"]*">([\s\S]*?)<\/p>/);
    const description = descMatch ? stripHtml(descMatch[1]) : "";

    // 语言
    const langMatch = block.match(/itemprop="programmingLanguage">([\s\S]*?)<\/span>/);
    const language = langMatch ? stripHtml(langMatch[1]) : "N/A";

    // 总 Star 数（从 stargazers 链接或 SVG 旁的数字提取）
    const starsMatch = block.match(/\/stargazers"[^>]*>([\s\S]*?)<\/a>/) ||
                        block.match(/class="[^"]*d-inline-block float-sm-right"[^>]*>([\s\S]*?)<\/a>/);
    const stars = starsMatch ? parseInt(stripHtml(starsMatch[1]).replace(/,/g, ""), 10) || 0 : 0;

    // 当期新增 Star
    const gainMatch = block.match(/([\d,]+)\s+stars?\s+(today|this week|this month)/i);
    const starsGained = gainMatch ? parseInt(gainMatch[1].replace(/,/g, ""), 10) : 0;

    if (name) {
      items.push({
        rank: items.length + 1,
        name,
        description,
        language,
        stars,
        starsGained,
        url: `https://github.com/${name}`,
      });
    }
  }

  return items;
}

/**
 * 主采集函数
 */
async function collect() {
  console.error("🔍 GitHub Trending: 采集中...");

  // 并行采集日榜和月榜
  const [dailyOSS, monthlyOSS] = await Promise.all([
    fetchFromOSSInsight("past_24_hours", 5),
    fetchFromOSSInsight("past_month", 20),
  ]);

  let daily, monthly;

  if (dailyOSS) {
    daily = dailyOSS;
    console.error("  ✅ 日榜 top5 (OSS Insight API)");
  } else {
    // 降级到 HTML
    daily = await fetchFromHTML("daily", 5);
    console.error("  ✅ 日榜 top5 (HTML fallback)");
  }

  if (monthlyOSS) {
    monthly = monthlyOSS;
    console.error("  ✅ 月榜 top20 (OSS Insight API)");
  } else {
    monthly = await fetchFromHTML("monthly", 20);
    console.error("  ✅ 月榜 top20 (HTML fallback)");
  }

  return formatOutput("github-trending", [], {
    daily: { count: daily.length, items: daily },
    monthly: { count: monthly.length, items: monthly },
  });
}

/**
 * 提取模式：从 JSON 文件中按序号提取条目为 Markdown
 */
function extract(jsonPath, indices) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const allItems = [
    ...(data.metadata?.daily?.items || []),
    ...(data.metadata?.monthly?.items || []),
  ];
  const selected = indices.map((i) => allItems[i]).filter(Boolean);

  let md = "## GitHub Trending 精选\n\n";
  for (const item of selected) {
    md += `### ${item.rank}. [${item.name}](${item.url})\n`;
    md += `- **描述**: ${item.description || "无"}\n`;
    md += `- **语言**: ${item.language} | **Stars**: ${item.stars.toLocaleString()}`;
    if (item.starsGained) md += ` (+${item.starsGained.toLocaleString()})`;
    if (item.score) md += ` | **Score**: ${item.score}`;
    md += "\n\n";
  }
  return md;
}

// CLI
const args = process.argv.slice(2);

if (args[0] === "--extract" && args[1]) {
  const indices = (args[2] || "0").split(",").map(Number);
  console.log(extract(resolve(args[1]), indices));
} else {
  const result = await collect();
  console.log(JSON.stringify(result, null, 2));
}
