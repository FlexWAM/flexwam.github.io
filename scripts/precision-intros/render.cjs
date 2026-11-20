// Optional media authoring tool: needs playwright-core, Chrome, and ffmpeg.
// PLAYWRIGHT_MODULE_PATH and FFMPEG may point to existing local installations.
// Sources: flexwam_release_v16.pptx slide 3 (image3/4.jpeg, image5/6.png).
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright-core",
);
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { mkdirSync } = require("node:fs");

// Seconds in the ORIGINAL recordings, checked at successful insertion followed
// by gripper release. The 4 s title is added when constructing overlay timings.
const successTimes = {
  cable: [5.6, 12.8, 22.2],
  "peg-l": [8.6, 16.0, 22.8],
};
const endHold = 1.5; // Give the final success annotation time to be read.
const selectedTask = process.argv
  .find((arg) => arg.startsWith("--task="))
  ?.split("=")[1];

(async () => {
  const root = resolve(__dirname, "../..");
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const badges = [];
    mkdirSync(resolve(__dirname, "badges"), { recursive: true });
    for (let count = 1; count <= 3; count++) {
      await page.goto(
        pathToFileURL(resolve(__dirname, "success-badge.html")).href +
          "?count=" +
          count,
      );
      await page.evaluate(() => document.fonts.ready);
      const badge = resolve(__dirname, `badges/success-${count}.png`);
      await page
        .locator(".badge")
        .screenshot({ path: badge, omitBackground: true });
      badges.push(badge);
    }
    for (const task of ["cable", "peg-l"]) {
      if (selectedTask && selectedTask !== task) continue;
      await page.goto(
        pathToFileURL(resolve(__dirname, "title-card.html")).href +
          "?task=" +
          task,
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.decode()));
      });
      // SVG image resources also need to finish decoding before capture.
      await page.waitForTimeout(300);
      const card = resolve(root, `public/posters/success/${task}-intro.jpg`);
      mkdirSync(resolve(root, "public/posters/success"), { recursive: true });
      await page.screenshot({ path: card, type: "jpeg", quality: 97 });
      console.log(`Rendered ${task} title card`);
      if (process.argv.includes("--cards-only")) continue;
      // Four seconds of introduction, then all of the original task footage.
      // Original playback timing and reset intervals are unchanged. Audio starts
      // with the original sequence, after the silent title card. A short final
      // freeze holds the completed 3-success counter; it adds no extra trial.
      const times = successTimes[task].map((time) => time + 4);
      // The peg source ends with 0.1 s of black frames. Hold the last actual
      // task frame instead; no manipulation or reset footage is removed.
      const footageDuration = task === "peg-l" ? 23.0 : 23.1;
      const holdDuration = endHold + (23.1 - footageDuration);
      const overlays = times
        .map((start, index) => {
          const input = index === 0 ? "base" : `success${index}`;
          const output = index === 2 ? "v" : `success${index + 1}`;
          const enabled = `gte(t,${start})${index < 2 ? `*lt(t,${times[index + 1]})` : ""}`;
          return `[${input}][${index + 2}:v]overlay=56:56:enable='${enabled}'[${output}]`;
        })
        .join(";");
      const filters = `[0:v]format=yuv420p,setsar=1,fade=t=out:st=3.65:d=0.35[intro];[1:v]trim=duration=${footageDuration},setsar=1,fade=t=in:st=0:d=0.3[rollout];[intro][rollout]concat=n=2:v=1:a=0,tpad=stop_mode=clone:stop_duration=${holdDuration}[base];${overlays};[1:a]atrim=duration=${footageDuration},adelay=4000|4000,apad=pad_dur=${holdDuration}[a]`;
      const result = spawnSync(
        process.env.FFMPEG || "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-loop",
          "1",
          "-framerate",
          "30",
          "-t",
          "4",
          "-i",
          card,
          "-i",
          resolve(root, `public/videos/success/${task}.mp4`),
          ...badges.flatMap((badge) => ["-i", badge]),
          "-filter_complex",
          filters,
          "-map",
          "[v]",
          "-map",
          "[a]",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-r",
          "30",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          "-threads",
          "4",
          "-t",
          "28.6",
          resolve(root, `public/videos/success/${task}-intro.mp4`),
        ],
        { stdio: "inherit" },
      );
      if (result.status !== 0) throw new Error(`ffmpeg failed for ${task}`);
      console.log(
        `Encoded ${task}: 4 s intro + complete original sequence + ${endHold} s final hold; successes at ${times.join(", ")} s`,
      );
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
