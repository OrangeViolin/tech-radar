/**
 * 公共 HTTP 工具 + 统一输出格式
 * 零依赖，所有采集器共用
 */

/**
 * 带超时重试的 fetch
 * @param {string} url
 * @param {object} opts - { timeout, retries, headers }
 * @returns {Promise<string>}
 */
export async function fetchWithRetry(url, opts = {}) {
  const { timeout = 15000, retries = 2, headers = {} } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
          ...headers,
        },
      });

      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }

      return await resp.text();
    } catch (err) {
      if (attempt === retries) throw err;
      // 等一下再重试
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

/**
 * fetch 并解析 JSON
 */
export async function fetchJSON(url, opts = {}) {
  const text = await fetchWithRetry(url, opts);
  return JSON.parse(text);
}

/**
 * 统一输出格式
 * @param {string} source - 数据源名称
 * @param {Array} items - 采集到的条目
 * @param {object} metadata - 额外元数据
 */
export function formatOutput(source, items, metadata = {}) {
  return {
    source,
    timestamp: new Date().toISOString(),
    count: items.length,
    metadata,
    items,
  };
}

/**
 * 简单 HTML 标签清理
 */
export function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
