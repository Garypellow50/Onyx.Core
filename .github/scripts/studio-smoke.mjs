import assert from "node:assert/strict";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const baseURL = "http://127.0.0.1:4173";
const output = "studio-smoke-artifacts";
const report = {
  startedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  browser: "Chromium",
  checks: [],
  viewports: [],
};
await mkdir(output, { recursive: true });

// Synthetic 20-second mono PCM WAV: no user files or remote media.
function silentWav() {
  const sampleRate = 22050;
  const dataSize = sampleRate * 20 * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

async function eventually(test, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  do {
    if (await test()) return;
    await delay(100);
  } while (Date.now() < deadline);
  assert.fail(message);
}

async function visible(locator) {
  await locator.waitFor({ state: "visible" });
  assert.equal(await locator.isVisible(), true);
}

async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1 &&
      dimensions.body <= dimensions.viewport + 1,
    `Horizontal overflow: ${JSON.stringify(dimensions)}`,
  );
  return dimensions;
}

async function inside(stage, locator, label) {
  await visible(locator);
  const outer = await stage.boundingBox();
  const inner = await locator.boundingBox();
  assert.ok(outer && inner, `${label}: missing bounding box`);
  assert.ok(
    inner.x >= outer.x - 1 &&
      inner.y >= outer.y - 1 &&
      inner.x + inner.width <= outer.x + outer.width + 1 &&
      inner.y + inner.height <= outer.y + outer.height + 1,
    `${label} outside stage: ${JSON.stringify({ stage: outer, element: inner })}`,
  );
  return inner;
}

function annotation(text) {
  return text
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  report.browserVersion = browser.version();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const label = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(45000);
    const evidence = {
      label,
      viewport,
      pageErrors: [],
      consoleErrors: [],
      blockedRequests: [],
      screenshots: [],
    };
    report.viewports.push(evidence);
    page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error")
        evidence.consoleErrors.push(message.text());
    });
    // Keep validation local. Block optional external fonts and telemetry.
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL || ["blob:", "data:"].includes(url.protocol)) {
        return route.continue();
      }
      evidence.blockedRequests.push(url.href);
      return route.abort();
    });
    async function check(name, operation) {
      const entry = { viewport: label, name, status: "running" };
      report.checks.push(entry);
      try {
        entry.evidence = await operation();
        entry.status = "passed";
        console.log(`PASS ${label}: ${name}`);
        return true;
      } catch (error) {
        entry.status = "failed";
        entry.error = error.stack ?? String(error);
        const message = annotation(`${name}: ${error.message}`);
        console.error(`::error title=Studio smoke ${label}::${message}`);
        return false;
      }
    }
    async function screenshot(state) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const path = `${output}/${label}-${state}.png`;
      await page.screenshot({ path, fullPage: true, animations: "disabled" });
      evidence.screenshots.push(path);
    }
    try {
      const ready = await check("Studio loads with real headings", async () => {
        const response = await page.goto(baseURL, { waitUntil: "networkidle" });
        assert.ok(response?.ok(), `HTTP status ${response?.status()}`);
        for (const name of [
          "Your screening room",
          "Your media. A quieter space.",
          "Add media",
          "Up next",
        ]) {
          await visible(page.getByRole("heading", { name, exact: true }));
        }
        await visible(page.getByText("Your queue is empty", { exact: true }));
      });
      if (!ready) continue;
      const stage = page.locator(".cinema-stage");
      const emptyHeading = stage.getByRole("heading", {
        name: "Your media. A quieter space.",
        exact: true,
      });
      const choose = stage.getByRole("button", {
        name: "Choose media",
        exact: true,
      });
      await check("Empty content fits stage without overflow", async () => ({
        heading: await inside(stage, emptyHeading, "Empty heading"),
        cta: await inside(stage, choose, "Choose media"),
        dimensions: await noOverflow(page),
      }));
      await check("Capture empty studio", () => screenshot("empty"));
      for (const name of ["Captions off", "Audio", "Speed 1×", "View"]) {
        await check(`${name}: pointer, keyboard, Escape, focus`, async () => {
          // Radix modal menus aria-hide the rest of the document while open.
          // Include that hidden trigger when reading its expanded state.
          const trigger = page.getByRole("button", {
            name,
            exact: true,
            includeHidden: true,
          });
          const menu = page.getByRole("menu");
          const focused = () =>
            trigger.evaluate((el) => el === document.activeElement);
          try {
            await trigger.click();
            await visible(menu);
            assert.equal(await trigger.getAttribute("aria-expanded"), "true");
            await page.keyboard.press("Escape");
            await menu.waitFor({ state: "hidden" });
            await eventually(focused, `${name}: focus not restored`);
            await page.keyboard.press("Enter");
            await visible(menu);
            await page.keyboard.press("ArrowDown");
            await eventually(
              () => menu.evaluate((el) => el.contains(document.activeElement)),
              `${name}: keyboard focus left menu`,
            );
            await page.keyboard.press("Escape");
            await menu.waitFor({ state: "hidden" });
            await eventually(focused, `${name}: keyboard focus not restored`);
          } finally {
            await page.keyboard.press("Escape");
          }
        });
      }
      await check(
        "Native details keyboard toggle; stats starts off",
        async () => {
          const details = page.locator("details").filter({
            has: page.locator("summary", { hasText: "Playback details" }),
          });
          const summary = details.locator("summary");
          assert.equal(await details.evaluate((el) => el.open), false);
          await summary.focus();
          await page.keyboard.press("Enter");
          await eventually(
            () => details.evaluate((el) => el.open),
            "Playback details did not open",
          );
          const stats = details.getByRole("button", {
            name: "Stats overlay Off",
            exact: true,
          });
          await visible(stats);
          assert.equal(await stats.getAttribute("aria-pressed"), "false");
          await summary.focus();
          await page.keyboard.press("Enter");
          await eventually(
            async () => !(await details.evaluate((el) => el.open)),
            "Playback details did not close",
          );
        },
      );
      const filename = `studio-smoke-${label}.wav`;
      const loaded = await check("Local WAV chooser", async () => {
        const [chooser] = await Promise.all([
          page.waitForEvent("filechooser"),
          choose.click(),
        ]);
        const input = chooser.element();
        assert.equal(await input.evaluate((el) => el.type), "file");
        await input.setInputFiles({
          name: filename,
          mimeType: "audio/wav",
          buffer: silentWav(),
        });
        const queue = page.locator("section").filter({
          has: page.getByRole("heading", { name: "Up next", exact: true }),
        });
        await visible(queue.getByText(filename, { exact: true }));
        await page.waitForFunction(() => {
          const video = document.querySelector(".cinema-stage video");
          return (
            video &&
            Number.isFinite(video.duration) &&
            video.duration > 0 &&
            video.readyState >= 2
          );
        });
        const metadata = await stage.locator("video").evaluate((video) => ({
          duration: video.duration,
          source: video.currentSrc,
          error: video.error?.message ?? null,
        }));
        assert.ok(
          Math.abs(metadata.duration - 20) < 0.1,
          `Unexpected WAV duration: ${metadata.duration}`,
        );
        assert.ok(metadata.source.startsWith("blob:"), "Expected local blob");
        assert.equal(metadata.error, null);
        return metadata;
      });
      if (loaded) {
        await check("Playback button pauses and resumes media", async () => {
          const video = stage.locator("video");
          const pause = page.getByRole("button", { name: "Pause", exact: true });
          if (!(await video.evaluate((el) => el.paused))) {
            await pause.click();
            await eventually(
              () => video.evaluate((el) => el.paused),
              "Initial pause failed",
            );
          }
          await page.getByRole("button", { name: "Play", exact: true }).click();
          await eventually(
            () => video.evaluate((el) => !el.paused && el.currentTime > 0),
            "Playback did not advance",
          );
          await pause.click();
          await eventually(
            () => video.evaluate((el) => el.paused),
            "Pause did not pause media",
          );
        });
        await check("Speed 2× sets native playbackRate to 2", async () => {
          await page
            .getByRole("button", { name: "Speed 1×", exact: true })
            .click();
          await page
            .getByRole("menuitemcheckbox", { name: "2×", exact: true })
            .click();
          await eventually(
            () => stage.locator("video").evaluate((el) => el.playbackRate === 2),
            "Native playbackRate did not become 2",
          );
          await visible(
            page.getByRole("button", { name: "Speed 2×", exact: true }),
          );
          await page.keyboard.press("Escape");
        });
        await check("Native volume keyboard input does not seek", async () => {
          const video = stage.locator("video");
          const volume = page.getByRole("slider", {
            name: "Volume",
            exact: true,
          });
          assert.equal(await volume.getAttribute("type"), "range");
          const before = await video.evaluate((el) => ({
            volume: el.volume,
            time: el.currentTime,
          }));
          await volume.focus();
          await page.keyboard.press("ArrowLeft");
          await eventually(
            () =>
              video.evaluate(
                (el, previous) => el.volume < previous,
                before.volume,
              ),
            "Volume did not decrease",
          );
          const after = await video.evaluate((el) => ({
            volume: el.volume,
            time: el.currentTime,
          }));
          assert.ok(
            Math.abs(after.volume - (before.volume - 0.01)) < 0.001,
            "Volume did not change by one native step",
          );
          assert.ok(
            Math.abs(after.time - before.time) < 0.1,
            "Volume arrow key was swallowed by seek shortcut",
          );
          return { before, after };
        });
        await check("Loaded studio has no overflow", () => noOverflow(page));
        await check("Capture loaded studio", () => screenshot("loaded"));
      }
      await check("No uncaught runtime exceptions", async () =>
        assert.deepEqual(evidence.pageErrors, []),
      );
    } finally {
      const failed = report.checks.some(
        (entry) => entry.viewport === label && entry.status === "failed",
      );
      if (failed) {
        await screenshot("failure").catch((error) => {
          evidence.screenshotError = error.message;
        });
      }
      await context.close();
    }
  }
} catch (error) {
  report.checks.push({
    name: "Smoke harness",
    status: "failed",
    error: error.stack ?? String(error),
  });
  console.error(`::error::${annotation(error.message)}`);
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  const failed = report.checks.filter((entry) => entry.status !== "passed");
  report.status = failed.length ? "failed" : "passed";
  report.passed = report.checks.length - failed.length;
  report.failed = failed.length;
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  const result = `${report.status}; ${report.passed} passed, ${report.failed} failed`;
  const summary = [
    "# Studio browser smoke",
    "",
    `Result: ${result}.`,
    `Commit: ${report.commit ?? "local"}`,
    "",
    "| Viewport | Check | Result |",
    "| --- | --- | --- |",
    ...report.checks.map(
      (entry) =>
        `| ${entry.viewport ?? "runner"} | ${entry.name} | ${entry.status} |`,
    ),
    "",
    ...failed.map(
      (entry) =>
        `## ${entry.viewport ?? "runner"}: ${entry.name}\n\n\`\`\`text\n${entry.error}\n\`\`\`\n`,
    ),
    "Only synthetic local audio was used. Screenshots were not visually reviewed.",
    "",
  ].join("\n");
  await writeFile(`${output}/report.md`, summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  console.log(`::notice title=Studio smoke result::${result}`);
  if (failed.length) process.exitCode = 1;
}
