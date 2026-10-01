/**
 * Before/after performance measurements: the naive table (every row in the DOM, filtering on the
 * main thread) vs the virtualized grid with the query worker, at 10k and 50k rows.
 *
 *   npx nx build screener && node tools/perf/measure.mjs [--runs 3] [--cpu 4]
 *
 * Runs against the production build with Chromium's CPU throttled (default 4x, roughly a mid-tier
 * phone). Each scenario is repeated and the median reported. Results feed docs/performance.md.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    cpu: { type: 'string', default: '4' },
    port: { type: 'string', default: '4400' },
  },
});
const RUNS = Number(values.runs);
const CPU = Number(values.cpu);
const BASE = `http://localhost:${values.port}`;
const DIST = 'dist/apps/screener/browser';
const TIMEOUT = 120_000;

if (!existsSync(`${DIST}/index.html`)) {
  console.error(`No production build in ${DIST}. Run: npx nx build screener`);
  process.exit(1);
}

const server = spawn(
  'npx',
  ['http-server', DIST, '-p', values.port, '-s', '-c-1'],
  {
    shell: true,
    stdio: 'ignore',
  },
);

const scenarios = [
  { name: 'Optimized (virtual grid + worker)', query: '' },
  { name: 'Naive (all rows + main thread)', query: 'naive=1' },
];
const sizes = [
  { rows: 10_000, query: '' },
  { rows: 50_000, query: 'rows=50000' },
];

/** Installed before any page script runs: collects long tasks and Event Timing entries. */
function instrument() {
  window.__perf = { longTasks: [], events: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      window.__perf.longTasks.push({
        start: e.startTime,
        duration: e.duration,
      });
  }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.interactionId)
        window.__perf.events.push({
          name: e.name,
          start: e.startTime,
          duration: e.duration,
        });
    }
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Static server did not start');
}

async function measureOnce(browser, url, naive) {
  // Pin the locale: the app picks its language from the browser, and the selectors below are English.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(instrument);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  const ready = naive
    ? 'table tbody tr'
    : '[role="grid"][aria-busy="false"] [role="row"][aria-rowindex="2"]';
  const firstRow = naive
    ? 'table tbody tr:first-child td'
    : '[role="row"][aria-rowindex="2"] [role="rowheader"]';
  const result = {};
  try {
    await page.goto(url, { timeout: TIMEOUT });
    await page.waitForSelector(ready, { timeout: TIMEOUT });
    Object.assign(
      result,
      await page.evaluate(() => {
        const longTasks = window.__perf.longTasks;
        return {
          loadMs: Math.round(performance.now()),
          loadLongTasks: longTasks.length,
          loadMaxLongTaskMs: Math.round(
            Math.max(0, ...longTasks.map((t) => t.duration)),
          ),
          domElements: document.getElementsByTagName('*').length,
        };
      }),
    );

    // Sort: click the Price header; time until the first row changes, and the worst event duration.
    const sortTarget = naive
      ? page.locator('thead button', { hasText: 'Price' })
      : page.getByRole('columnheader', { name: /^Price/ });
    const before = await page.locator(firstRow).first().textContent();
    await page.evaluate(() => (window.__perf.events = []));
    const sortStart = Date.now();
    await sortTarget.click();
    await page.waitForFunction(
      ([selector, text]) =>
        document.querySelector(selector)?.textContent !== text,
      [firstRow, before],
      { timeout: TIMEOUT },
    );
    result.sortVisibleMs = Date.now() - sortStart;
    await page.waitForTimeout(300);
    result.sortWorstEventMs = await page.evaluate(() =>
      Math.round(Math.max(0, ...window.__perf.events.map((e) => e.duration))),
    );

    // Typing in the search box: worst event duration while typing four characters.
    await page.evaluate(() => (window.__perf.events = []));
    await page.getByRole('searchbox').pressSequentially('bank', { delay: 80 });
    await page.waitForTimeout(1500);
    result.typingWorstEventMs = await page.evaluate(() =>
      Math.round(Math.max(0, ...window.__perf.events.map((e) => e.duration))),
    );
    await page.getByRole('searchbox').fill('');
    await page.waitForTimeout(1500);

    // Scroll: wheel through the list for ~3 s and record frame intervals.
    const scroller = naive ? '.dh-naive' : '.dh-grid-scroller';
    const box = await page.locator(scroller).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => {
      window.__frames = [];
      let last = performance.now();
      const tick = (now) => {
        window.__frames.push(now - last);
        last = now;
        if (window.__frames.length < 100000)
          window.__raf = requestAnimationFrame(tick);
      };
      window.__raf = requestAnimationFrame(tick);
      window.__perf.longTasks = [];
    });
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(50);
    }
    Object.assign(
      result,
      await page.evaluate(() => {
        cancelAnimationFrame(window.__raf);
        const frames = window.__frames.slice(1);
        const sorted = [...frames].sort((a, b) => a - b);
        return {
          scrollFrames: frames.length,
          scrollP95FrameMs: Math.round(
            sorted[Math.floor(sorted.length * 0.95)] ?? 0,
          ),
          scrollDroppedPct: Math.round(
            (frames.filter((f) => f > 50).length / Math.max(1, frames.length)) *
              100,
          ),
          scrollLongTasks: window.__perf.longTasks.length,
        };
      }),
    );
  } catch (error) {
    result.error = String(error.message ?? error).split('\n')[0];
  } finally {
    await context.close();
  }
  return result;
}

const median = (xs) => {
  const sorted = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

try {
  await waitForServer();
  const browser = await chromium.launch();
  const report = [];
  for (const size of sizes) {
    for (const scenario of scenarios) {
      const query = [scenario.query, size.query].filter(Boolean).join('&');
      const url = `${BASE}/${query ? `?${query}` : ''}`;
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        runs.push(
          await measureOnce(browser, url, scenario.query.includes('naive')),
        );
      }
      const keys = Object.keys(runs.find((r) => !r.error) ?? {}).filter(
        (k) => k !== 'error',
      );
      const summary = Object.fromEntries(
        keys.map((k) => [k, median(runs.map((r) => r[k]))]),
      );
      const errors = runs.filter((r) => r.error).map((r) => r.error);
      report.push({
        rows: size.rows,
        scenario: scenario.name,
        ...summary,
        ...(errors.length ? { errors } : {}),
      });
      console.error(`done: ${size.rows} rows, ${scenario.name}`);
    }
  }
  await browser.close();
  console.log(
    JSON.stringify({ cpuThrottling: CPU, runs: RUNS, report }, null, 2),
  );
} finally {
  server.kill();
}
