import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const inputPath = "examples/sampleImages/rainbox-steps.png";
const ownResultsDir = "floyd-steinberg-results";
const outputDir = "imagemagick-comparison";

const palettes = {
  spectra6: [
    ["black", "#1F2226"],
    ["white", "#B9C7C9"],
    ["blue", "#233F8E"],
    ["green", "#35563A"],
    ["red", "#62201E"],
    ["yellow", "#C1BB1E"],
  ],
  "aitjcize-spectra6": [
    ["black", "#020202"],
    ["white", "#BEC8C8"],
    ["blue", "#05409E"],
    ["green", "#27663C"],
    ["red", "#871300"],
    ["yellow", "#CDCA00"],
  ],
};

const ownVariants = [
  ["own uint8 clamped RGB", "01-fs-uint8-clamped-rgb"],
  ["own standard float RGB", "02-fs-standard-float-rgb"],
  ["own serpentine float RGB", "03-fs-serpentine-float-rgb"],
  ["own chroma float", "05-fs-standard-float-chroma"],
];

mkdirSync(outputDir, { recursive: true });

const [width, height] = execFileSync("magick", [
  "identify",
  "-format",
  "%w %h",
  inputPath,
])
  .toString()
  .trim()
  .split(/\s+/)
  .map(Number);
const pixelCount = width * height;

const magickVersion = execFileSync("magick", ["-version"])
  .toString()
  .split("\n")[0]
  .trim();

const readme = [
  "# ImageMagick Comparison",
  "",
  `Input: \`${inputPath}\``,
  `Image size: ${width} x ${height}`,
  `ImageMagick: ${magickVersion}`,
  "",
  "ImageMagick command shape:",
  "",
  "```sh",
  "magick input.png -alpha remove -alpha off -dither FloydSteinberg -remap palette.ppm output.png",
  "```",
  "",
  "The palette files in this folder contain the same calibrated Spectra 6 colors used by the project outputs.",
  "",
];

for (const [paletteName, paletteEntries] of Object.entries(palettes)) {
  const palettePpm = join(outputDir, `${paletteName}-palette.ppm`);
  writePalettePpm(palettePpm, paletteEntries);

  const imQuant = join(
    outputDir,
    `${paletteName}-imagemagick-00-remap-no-dither.png`
  );
  const imFs = join(
    outputDir,
    `${paletteName}-imagemagick-01-floyd-steinberg.png`
  );

  runMagick([
    inputPath,
    "-alpha",
    "remove",
    "-alpha",
    "off",
    "+dither",
    "-remap",
    palettePpm,
    imQuant,
  ]);
  runMagick([
    inputPath,
    "-alpha",
    "remove",
    "-alpha",
    "off",
    "-dither",
    "FloydSteinberg",
    "-remap",
    palettePpm,
    imFs,
  ]);

  readme.push(`## ${paletteName}`, "");
  readme.push("### Color Usage", "");
  readme.push("| Output | Color usage |");
  readme.push("| --- | --- |");
  readme.push(
    `| ImageMagick no dither | ${formatStats(
      getColorStats(imQuant, paletteEntries)
    )} |`
  );
  readme.push(
    `| ImageMagick Floyd-Steinberg | ${formatStats(
      getColorStats(imFs, paletteEntries)
    )} |`
  );

  for (const [label, id] of ownVariants) {
    const ownPath = join(ownResultsDir, `${paletteName}-${id}.png`);
    readme.push(
      `| ${label} | ${formatStats(getColorStats(ownPath, paletteEntries))} |`
    );
  }

  readme.push("", "### Exact Pixel Difference vs ImageMagick Floyd-Steinberg", "");
  readme.push("| Project output | Different pixels | Same pixels | Diff image |");
  readme.push("| --- | ---: | ---: | --- |");

  const comparisonParts = [];
  for (const [label, id] of ownVariants) {
    const ownPath = join(ownResultsDir, `${paletteName}-${id}.png`);
    const diffPath = join(outputDir, `${paletteName}-diff-im-fs-vs-${id}.png`);
    const differentPixels = compareImages(ownPath, imFs, diffPath);
    const samePercent = ((1 - differentPixels / pixelCount) * 100).toFixed(2);
    const differentPercent = ((differentPixels / pixelCount) * 100).toFixed(2);
    readme.push(
      `| ${label} | ${differentPixels} (${differentPercent}%) | ${samePercent}% | \`${diffPath}\` |`
    );
  }

  comparisonParts.push(
    join(ownResultsDir, `${paletteName}-02-fs-standard-float-rgb.png`),
    join(ownResultsDir, `${paletteName}-03-fs-serpentine-float-rgb.png`),
    imFs,
    join(ownResultsDir, `${paletteName}-05-fs-standard-float-chroma.png`)
  );
  runMagick([
    ...comparisonParts,
    "+append",
    join(outputDir, `${paletteName}-project-vs-imagemagick-strip.png`),
  ]);
  readme.push(
    "",
    `Strip order: project standard RGB, project serpentine RGB, ImageMagick Floyd-Steinberg, project chroma.`,
    `Strip: \`${join(outputDir, `${paletteName}-project-vs-imagemagick-strip.png`)}\``,
    ""
  );
}

writeFileSync(join(outputDir, "README.md"), `${readme.join("\n")}\n`);

function runMagick(args) {
  execFileSync("magick", args, { stdio: "pipe" });
}

function writePalettePpm(path, entries) {
  const pixels = entries
    .map(([, hex]) => hexToRgb(hex).join(" "))
    .join("\n");
  writeFileSync(path, `P3\n${entries.length} 1\n255\n${pixels}\n`);
}

function compareImages(left, right, diffPath) {
  const result = spawnSync(
    "magick",
    ["compare", "-metric", "AE", left, right, diffPath],
    { encoding: "utf8" }
  );
  const metric = `${result.stderr}${result.stdout}`.trim();
  const differentPixels = Number.parseInt(metric, 10);
  if (!Number.isFinite(differentPixels)) {
    throw new Error(
      `Could not parse ImageMagick compare output for ${left}: ${metric}`
    );
  }
  return differentPixels;
}

function getColorStats(imagePath, paletteEntries) {
  const histogram = execFileSync("magick", [
    imagePath,
    "-format",
    "%c",
    "histogram:info:-",
  ]).toString();
  const countsByHex = new Map();

  for (const line of histogram.split("\n")) {
    const match = line.match(/^\s*(\d+):.*#([0-9A-Fa-f]{6})(?:[0-9A-Fa-f]{2})?/);
    if (!match) continue;
    countsByHex.set(match[2].toUpperCase(), Number.parseInt(match[1], 10));
  }

  return paletteEntries.map(([name, hex]) => [
    name,
    countsByHex.get(hex.replace("#", "").toUpperCase()) ?? 0,
  ]);
}

function formatStats(stats) {
  const total = stats.reduce((sum, [, count]) => sum + count, 0);
  return stats
    .map(([name, count]) => `${name} ${((count / total) * 100).toFixed(1)}%`)
    .join("<br>");
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}
