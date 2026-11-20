// Rebuild the standalone precision tests from the original processed footage.
// PLAYWRIGHT_MODULE_PATH, CHROME, FFMPEG and PRECISION_SOURCE_DIR are optional.
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright-core",
);
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { mkdirSync, renameSync } = require("node:fs");
const root = resolve(__dirname, "../..");
const source =
  process.env.PRECISION_SOURCE_DIR || resolve(root, "../Flexwam_materials");
const introDuration = 1.2;
// Checked against insertion/release frames in the source footage. No trials
// or reset intervals are removed; the round source has a 2 s black tail.
const tasks = require("./clips.json");
const selected = process.argv
  .find((arg) => arg.startsWith("--task="))
  ?.split("=")[1];
(async () => {
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
    const overlayDir = resolve(__dirname, "overlays");
    mkdirSync(overlayDir, { recursive: true });
    for (const [task, config] of Object.entries(tasks)) {
      if (selected && !selected.split(",").includes(task)) continue;
      const totalTrials = config.successes.length;
      const footageEnd = config.duration + config.hold;
      const totalDuration = introDuration + footageEnd;
      if (config.resets.length !== totalTrials - 1)
        throw new Error(`Invalid reset count: ${task}`);
      for (let i = 0; i < totalTrials; i++) {
        const start = i ? config.resets[i - 1][1] : 0;
        const end = i < totalTrials - 1 ? config.resets[i][0] : config.duration;
        if (!(start < config.successes[i] && config.successes[i] < end))
          throw new Error(`Invalid trial timing: ${task} / ${i + 1}`);
      }
      await page.goto(
        pathToFileURL(resolve(__dirname, "title-card.html")).href +
          `?task=${config.task}`,
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.decode()));
        await Promise.all(
          [...document.querySelectorAll("svg image")].map(
            (el) =>
              new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = resolve;
                img.onerror = reject;
                img.src = el.getAttribute("href");
              }),
          ),
        );
      });
      const card = resolve(root, `public/posters/success/${task}-intro.jpg`);
      await page.screenshot({ path: card, type: "jpeg", quality: 95 });
      const stages = [];
      for (let i = 0; i < totalTrials; i++) {
        stages.push({
          state: "trial",
          count: i + 1,
          start: i ? config.resets[i - 1][1] : 0,
          end: config.successes[i],
        });
        stages.push({
          state: "success",
          count: i + 1,
          start: config.successes[i],
          end: i < totalTrials - 1 ? config.resets[i][0] : footageEnd,
        });
        if (i < totalTrials - 1)
          stages.push({
            state: "reset",
            count: i + 1,
            start: config.resets[i][0],
            end: config.resets[i][1],
          });
      }
      for (const stage of stages) {
        stage.path = resolve(
          overlayDir,
          `${task}-${stage.state}-${stage.count}.png`,
        );
        await page.goto(
          pathToFileURL(resolve(__dirname, "rollout-overlay.html")).href +
            `?task=${config.task}&state=${stage.state}&count=${stage.count}`,
        );
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: stage.path, omitBackground: true });
      }
      const hold = config.hold;
      const filters = [
        `[0:v]scale=1920:1080,format=yuv420p,setsar=1,fade=t=out:st=1:d=0.2[intro]`,
        `[1:v]trim=duration=${config.duration},setpts=PTS-STARTPTS,setsar=1,fade=t=in:st=0:d=0.2[rollout]`,
        `[intro][rollout]concat=n=2:v=1:a=0,tpad=stop_mode=clone:stop_duration=${hold}[base]`,
        ...stages.map(
          (stage, i) =>
            `[${i ? `stage${i}` : "base"}][${i + 2}:v]overlay=0:0:enable='gte(t,${stage.start + introDuration})*lt(t,${stage.end + introDuration})'[${i === stages.length - 1 ? "v" : `stage${i + 1}`}]`,
        ),
        `[1:a]atrim=duration=${config.duration},asetpts=PTS-STARTPTS,adelay=1200|1200,apad=pad_dur=${hold}[a]`,
      ].join(";");
      const target = resolve(root, `public/videos/success/${task}-intro.mp4`);
      const temporary = target.replace(".mp4", ".partial.mp4");
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
          String(introDuration),
          "-i",
          resolve(root, `public/posters/success/${task}-intro.jpg`),
          "-i",
          resolve(source, config.source),
          ...stages.flatMap((stage) => ["-i", stage.path]),
          "-filter_complex_threads",
          "2",
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
          String(totalDuration),
          temporary,
        ],
        { stdio: "inherit" },
      );
      if (result.status !== 0) throw new Error(`ffmpeg failed for ${task}`);
      renameSync(temporary, target);
      console.log(
        `Updated ${task}: ${totalTrials} successful trials, ${config.resets.length} resets; ${totalDuration.toFixed(3)} s.`,
      );
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
