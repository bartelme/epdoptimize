export function renderColorPalette(target: HTMLElement, colors: string[]) {
  target.innerHTML = "";
  for (const color of colors) {
    const hexColor = normalizeHexColor(color);
    const swatch = document.createElement("button");
    swatch.className = "color-swatch";
    swatch.type = "button";
    swatch.style.backgroundColor = color;
    swatch.title = `${hexColor} - click to copy`;
    swatch.dataset.tooltip = hexColor;
    swatch.setAttribute("aria-label", `Copy ${hexColor}`);
    swatch.addEventListener("click", () => copyPaletteColor(swatch, hexColor));
    target.append(swatch);
  }
}

function normalizeHexColor(color: string) {
  const trimmed = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (!match) return trimmed.toUpperCase();
  const value = match[1]!;
  if (value.length === 6) return `#${value.toUpperCase()}`;
  return `#${value
    .split("")
    .map((channel) => channel + channel)
    .join("")
    .toUpperCase()}`;
}

async function copyPaletteColor(swatch: HTMLButtonElement, hexColor: string) {
  const originalTooltip = swatch.dataset.tooltip ?? hexColor;
  try {
    await copyText(hexColor);
    swatch.dataset.tooltip = `Copied ${hexColor}`;
    swatch.title = `Copied ${hexColor}`;
  } catch {
    swatch.dataset.tooltip = "Copy failed";
    swatch.title = `Copy failed: ${hexColor}`;
  } finally {
    window.setTimeout(() => {
      swatch.dataset.tooltip = originalTooltip;
      swatch.title = `${hexColor} - click to copy`;
    }, 1200);
  }
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command failed");
}
