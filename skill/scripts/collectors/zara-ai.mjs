#!/usr/bin/env node
/**
 * 张咋啦 AI 推荐采集器
 * 数据源：zara.faces.site/ai (Next.js RSC payload)
 *
 * 只关注：YouTube 视频 + Podcasts 的更新
 * 策略：先把 RSC payload 中的转义 JSON 字符串还原为普通 JS，再逐条正则提取
 *
 * 用法：
 *   node zara-ai.mjs                          # 采集 + 对比快照 → JSON
 *   node zara-ai.mjs --extract data.json 0,4  # 按序号提取 → Markdown
 */

import { fetchWithRetry, formatOutput } from "../lib/fetcher.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ZARA_URL = "https://zara.faces.site/ai";
const SNAPSHOT_DIR = resolve(__dirname, "../../.snapshots");
const SNAPSHOT_FILE = resolve(SNAPSHOT_DIR, "zara-ai-snapshot.json");

/**
 * 预处理：将 RSC payload 中的转义还原
 * \" → "   \\ → \   \u003c → <   \u003e → >   \u0026 → &
 */
function unescapeRSC(raw) {
  return raw
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026amp;/g, "&")
    .replace(/\\u0026nbsp;/g, " ")
    .replace(/\\u0026/g, "&")
    .replace(/\\u2014/g, "—")
    .replace(/\\"/g, '"')
    .replace(/\\\\"/g, '"');
}

function cleanTitle(s) {
  return s.replace(/<\/?strong>/g, "").trim();
}

/**
 * 提取 YouTube 视频
 */
function extractVideos(text) {
  const items = [];
  // 在还原后的文本中，每条视频格式为:
  // {id:"vid1",title:"<strong>...</strong>",description:"...",channel:"...",tags:"...",videoId:"...",duration:"...",url:"...",tldwUrl:"...",isFeatured:!0}
  // 用 videoId 作为锚点逐条切割
  const pattern = /\{id:"([^"]+)",title:"((?:[^"]|"(?!,description:))*)",description:"((?:[^"]|"(?!,channel:))*)",channel:"((?:[^"]|"(?!,tags:))*)",tags:"([^"]*)",videoId:"([^"]+)",duration:"([^"]+)",url:"([^"]+)",tldwUrl:"([^"]*(?:"[^,}][^"]*)*)",isFeatured:(!0|!1)\}/g;

  let m;
  while ((m = pattern.exec(text))) {
    items.push({
      id: m[1],
      title: cleanTitle(m[2]),
      description: m[3].replace(/"/g, ''),
      channel: m[4],
      tags: m[5].split(",").map(t => t.trim()).filter(Boolean),
      videoId: m[6],
      duration: m[7],
      url: `https://www.youtube.com/watch?v=${m[6]}`,
      isFeatured: m[10] === "!0",
    });
  }

  // 如果复杂正则失败，用简单的 videoId 锚点提取
  if (items.length === 0) {
    const simple = /\{id:"([^"]+)"[^}]*?videoId:"([A-Za-z0-9_-]+)"[^}]*?duration:"([^"]+)"[^}]*?isFeatured:(!0|!1)\}/g;
    while ((m = simple.exec(text))) {
      // 在匹配区间内单独提取各字段
      const block = text.substring(m.index, m.index + m[0].length + 200);
      const title = block.match(/title:"([^"]+)"/)?.[1] || "";
      const desc = block.match(/description:"([^"]+)"/)?.[1] || "";
      const channel = block.match(/channel:"([^"]+)"/)?.[1] || "";
      const tags = block.match(/tags:"([^"]+)"/)?.[1] || "";

      items.push({
        id: m[1],
        title: cleanTitle(title),
        description: desc,
        channel,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        videoId: m[2],
        duration: m[3],
        url: `https://www.youtube.com/watch?v=${m[2]}`,
        isFeatured: m[4] === "!0",
      });
    }
  }

  return items;
}

/**
 * 提取 Podcasts
 */
function extractPodcasts(text) {
  const items = [];
  const pattern = /\{id:"([^"]+)",title:"([^"]*)",description:"([^"]*)",url:"([^"]+)",watchingRecommended:(!0|!1)\}/g;
  let m;
  while ((m = pattern.exec(text))) {
    items.push({
      id: m[1],
      title: cleanTitle(m[2]),
      description: m[3],
      url: m[4],
      recommended: m[5] === "!0",
    });
  }
  return items;
}

// ─── 快照对比 ───────────────────────────────────────────────

function diffSnapshots(current, previous) {
  const diff = { hasChanges: false, videos: { added: [], removed: [] }, podcasts: { added: [], removed: [] } };
  for (const section of ["videos", "podcasts"]) {
    const curIds = new Set(current[section].map(i => i.id));
    const prevIds = new Set((previous[section] || []).map(i => i.id));
    diff[section].added = current[section].filter(i => !prevIds.has(i.id));
    diff[section].removed = (previous[section] || []).filter(i => !curIds.has(i.id));
    if (diff[section].added.length > 0 || diff[section].removed.length > 0) diff.hasChanges = true;
  }
  return diff;
}

function loadSnapshot() {
  if (!existsSync(SNAPSHOT_FILE)) return null;
  try { return JSON.parse(readFileSync(SNAPSHOT_FILE, "utf-8")); } catch { return null; }
}

function saveSnapshot(data) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));
}

// ─── 主采集 ─────────────────────────────────────────────────

async function collect() {
  console.error("🔍 张咋啦 AI 推荐: 采集中...");

  const rawHtml = await fetchWithRetry(ZARA_URL, { timeout: 30000 });

  // 关键：先还原转义，让正则能正常工作
  const text = unescapeRSC(rawHtml);

  const videos = extractVideos(text);
  const podcasts = extractPodcasts(text);

  console.error(`  ✅ 视频 ${videos.length} | 播客 ${podcasts.length}`);

  // 快照对比
  const prev = loadSnapshot();
  let diff = { hasChanges: false, videos: { added: [], removed: [] }, podcasts: { added: [], removed: [] } };

  if (prev) {
    diff = diffSnapshots({ videos, podcasts }, prev.sections);
    if (diff.hasChanges) {
      const parts = [];
      if (diff.videos.added.length) parts.push(`视频 +${diff.videos.added.length}`);
      if (diff.videos.removed.length) parts.push(`视频 -${diff.videos.removed.length}`);
      if (diff.podcasts.added.length) parts.push(`播客 +${diff.podcasts.added.length}`);
      if (diff.podcasts.removed.length) parts.push(`播客 -${diff.podcasts.removed.length}`);
      console.error(`  🆕 检测到更新: ${parts.join(", ")}`);
    } else {
      console.error(`  ℹ️ 无变化（与上次快照一致）`);
    }
  } else {
    console.error(`  ℹ️ 首次采集，已建立基线快照`);
  }

  saveSnapshot({ timestamp: new Date().toISOString(), sections: { videos, podcasts } });

  const allItems = [
    ...videos.map(v => ({ ...v, category: "视频" })),
    ...podcasts.map(p => ({ ...p, category: "播客" })),
  ];

  return formatOutput("zara-ai", allItems, {
    videos: { count: videos.length, items: videos },
    podcasts: { count: podcasts.length, items: podcasts },
    diff,
  });
}

function extract(jsonPath, indices) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const selected = indices.map(i => data.items[i]).filter(Boolean);
  let md = "## 张咋啦 AI 推荐精选\n\n";
  for (const item of selected) {
    md += `### [${item.category}] ${item.title}\n`;
    if (item.channel) md += `- **频道**: ${item.channel}\n`;
    if (item.description) md += `- ${item.description}\n`;
    if (item.duration) md += `- **时长**: ${item.duration}\n`;
    if (item.url) md += `- [链接](${item.url})\n`;
    md += "\n";
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
