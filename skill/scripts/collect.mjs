#!/usr/bin/env node
/**
 * 采集协调器
 * 自动发现 collectors/ 目录下所有 .mjs 采集器，并行执行，输出汇总结果
 *
 * 用法：
 *   node collect.mjs                    # 运行所有采集器
 *   node collect.mjs gh-trending        # 只运行指定采集器
 *   node collect.mjs --output /tmp/     # 指定输出目录
 */

import { readdirSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COLLECTORS_DIR = resolve(__dirname, "collectors");

/**
 * 获取所有采集器（自动发现，文件系统即注册表）
 */
function discoverCollectors() {
  return readdirSync(COLLECTORS_DIR)
    .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
    .map((f) => ({
      name: basename(f, ".mjs"),
      path: resolve(COLLECTORS_DIR, f),
    }));
}

/**
 * 执行单个采集器
 */
function runCollector(collector) {
  return new Promise((resolveP) => {
    const start = Date.now();
    execFile(
      "node",
      [collector.path],
      { timeout: 60000, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        if (stderr) process.stderr.write(stderr);

        if (error) {
          console.error(`❌ ${collector.name} 失败 (${elapsed}s): ${error.message}`);
          resolveP({
            name: collector.name,
            success: false,
            error: error.message,
            elapsed,
          });
          return;
        }

        try {
          const data = JSON.parse(stdout);
          console.error(`✅ ${collector.name} 完成 (${elapsed}s)`);
          resolveP({
            name: collector.name,
            success: true,
            data,
            elapsed,
          });
        } catch (e) {
          console.error(`❌ ${collector.name} JSON 解析失败 (${elapsed}s)`);
          resolveP({
            name: collector.name,
            success: false,
            error: `JSON parse error: ${e.message}`,
            raw: stdout.slice(0, 500),
            elapsed,
          });
        }
      }
    );
  });
}

// CLI
const args = process.argv.slice(2);
let outputDir = null;
let filterNames = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--output" && args[i + 1]) {
    outputDir = resolve(args[++i]);
  } else {
    filterNames.push(args[i]);
  }
}

// 发现采集器
let collectors = discoverCollectors();

if (filterNames.length > 0) {
  collectors = collectors.filter((c) => filterNames.includes(c.name));
}

console.error(`\n🚀 启动采集：${collectors.map((c) => c.name).join(", ")}\n`);

// 并行执行所有采集器
const results = await Promise.all(collectors.map(runCollector));

// 汇总
const summary = {
  timestamp: new Date().toISOString(),
  collectors: results.length,
  success: results.filter((r) => r.success).length,
  failed: results.filter((r) => !r.success).length,
  results: {},
};

for (const r of results) {
  if (r.success) {
    summary.results[r.name] = r.data;
  } else {
    summary.results[r.name] = { error: r.error };
  }
}

// 输出
if (outputDir) {
  mkdirSync(outputDir, { recursive: true });

  // 每个源独立文件
  for (const r of results) {
    if (r.success) {
      const filePath = resolve(outputDir, `${r.name}.json`);
      writeFileSync(filePath, JSON.stringify(r.data, null, 2));
      console.error(`📁 ${r.name} → ${filePath}`);
    }
  }

  // 汇总文件
  const summaryPath = resolve(outputDir, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.error(`📁 汇总 → ${summaryPath}`);
}

console.log(JSON.stringify(summary, null, 2));
console.error(`\n📊 采集完成：${summary.success}/${summary.collectors} 成功\n`);
