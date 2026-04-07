#!/usr/bin/env node
/**
 * Polymarket AI/Tech 预测市场采集器
 * 数据源：Polymarket Gamma API（无需认证）
 *
 * 用法：
 *   node polymarket-trending.mjs                          # 采集 top10 → JSON
 *   node polymarket-trending.mjs --extract data.json 0,4  # 按序号提取 → Markdown
 */

import { fetchJSON, formatOutput } from "../lib/fetcher.mjs";
import { readFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://gamma-api.polymarket.com/markets";

/**
 * 从 Polymarket 获取指定 tag 的市场
 */
async function fetchMarkets(tag) {
  const url = `${BASE_URL}?closed=false&tag=${tag}&limit=20&order=volume24hr&ascending=false`;
  try {
    return await fetchJSON(url, { timeout: 15000, retries: 2 });
  } catch (err) {
    console.error(`  ⚠️ 获取 tag=${tag} 失败: ${err.message}`);
    return [];
  }
}

/**
 * 主采集函数
 */
async function collect() {
  console.error("🔍 Polymarket AI/Tech: 采集中...");

  // Fetch both tags in parallel
  const [aiMarkets, techMarkets] = await Promise.all([
    fetchMarkets("AI"),
    fetchMarkets("Technology"),
  ]);

  console.error(`  📊 AI tag: ${aiMarkets.length} markets, Technology tag: ${techMarkets.length} markets`);

  // Merge and deduplicate by id
  const seen = new Set();
  const allMarkets = [];
  for (const m of [...aiMarkets, ...techMarkets]) {
    const id = m.id || m.conditionId;
    if (id && !seen.has(id)) {
      seen.add(id);
      allMarkets.push(m);
    }
  }

  const items = allMarkets.map((m) => {
    // Parse outcome prices - could be string or array
    let outcomePrices = null;
    try {
      if (typeof m.outcomePrices === "string") {
        outcomePrices = JSON.parse(m.outcomePrices);
      } else if (Array.isArray(m.outcomePrices)) {
        outcomePrices = m.outcomePrices;
      }
    } catch {
      outcomePrices = null;
    }

    const yesPrice = outcomePrices?.[0]
      ? (parseFloat(outcomePrices[0]) * 100).toFixed(1) + "%"
      : "N/A";
    const noPrice = outcomePrices?.[1]
      ? (parseFloat(outcomePrices[1]) * 100).toFixed(1) + "%"
      : "N/A";

    return {
      id: m.id || m.conditionId || "",
      question: m.question || "",
      volume24hr: parseFloat(m.volume24hr || m.volume || 0),
      liquidity: parseFloat(m.liquidity || 0),
      yes_probability: yesPrice,
      no_probability: noPrice,
      slug: m.slug || "",
      url: m.slug ? `https://polymarket.com/event/${m.slug}` : "",
    };
  });

  // Sort by 24h volume descending, take top 10
  items.sort((a, b) => b.volume24hr - a.volume24hr);
  const top10 = items.slice(0, 10).map((item, i) => ({
    rank: i + 1,
    ...item,
  }));

  console.error(`  ✅ Top ${top10.length} markets (from ${allMarkets.length} unique)`);

  return formatOutput("polymarket-trending", top10, {
    tags: ["AI", "Technology"],
    totalUnique: allMarkets.length,
  });
}

function extract(jsonPath, indices) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const selected = indices.map((i) => data.items[i]).filter(Boolean);

  let md = "## Polymarket AI/Tech 预测市场\n\n";
  for (const item of selected) {
    const vol = item.volume24hr >= 1000
      ? `$${(item.volume24hr / 1000).toFixed(1)}k`
      : `$${item.volume24hr.toFixed(0)}`;
    md += `### ${item.rank}. ${item.question}\n`;
    md += `- **Yes**: ${item.yes_probability} | **No**: ${item.no_probability}\n`;
    md += `- **24h Volume**: ${vol} | **Liquidity**: $${item.liquidity.toFixed(0)}\n`;
    if (item.url) md += `- [查看市场](${item.url})\n`;
    md += `\n`;
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
