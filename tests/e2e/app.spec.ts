import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.resolve(__dirname, "../fixtures/samples");
const SHOTS = path.resolve(__dirname, "../../docs/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const resultSize = async (page: Page) => (await page.locator("dl.stats dd").first().textContent())?.trim();

const openFakeEgg = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: /9\.37px grid/ }).click();
  await expect.poll(() => resultSize(page)).toBe("16×16");
};

// the canvas is larger than the image (zoom/pan) — on-screen image position is in data-view="x,y,z" (z = px per pixel)
const result = (page: Page) => page.getByRole("img", { name: "Pixel Truth result" });
const viewOf = async (page: Page) => (await result(page).getAttribute("data-view"))!.split(",").map(Number);

// read the color of result pixel (x, y) from the actual canvas
const resultPixel = async (page: Page, x: number, y: number) => {
  const [vx, vy, z] = await viewOf(page);
  return result(page).evaluate(
    (c: HTMLCanvasElement, [px, py]) => {
      const k = c.width / c.getBoundingClientRect().width;
      return Array.from(c.getContext("2d")!.getImageData(Math.floor(px * k), Math.floor(py * k), 1, 1).data).join(",");
    },
    [vx + (x + 0.5) * z, vy + (y + 0.5) * z],
  );
};

// transparent pixel = checkerboard visible inside the image frame
const CHECKER = ["246,243,234,255", "232,228,218,255"];
const isClear = (rgba: string) => CHECKER.includes(rgba);

const clickResultPixel = async (page: Page, x: number, y: number) => {
  const [vx, vy, z] = await viewOf(page);
  const box = (await result(page).boundingBox())!;
  await page.mouse.click(box.x + vx + (x + 0.5) * z, box.y + vy + (y + 0.5) * z);
};

test("defaults to English + logo is about as large as the heading", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("label.btn", { hasText: "Open image" })).toBeVisible();
  const logo = (await page.locator(".top svg.logo").boundingBox())!;
  const title = (await page.locator(".top .title").boundingBox())!;
  expect(logo.height).toBeGreaterThanOrEqual(title.height * 0.85);
  await page.screenshot({ path: `${SHOTS}/01-empty.png` });
  expect(errors).toEqual([]);
});

test("language button is a circle the size of Open image, toggles EN/TH and persists after reload", async ({ page }) => {
  await page.goto("/");
  const lang = page.getByRole("button", { name: "Switch to ภาษาไทย" });
  await expect(lang).toHaveText("EN");
  const lb = (await lang.boundingBox())!;
  const ob = (await page.locator("label.btn", { hasText: "Open image" }).boundingBox())!;
  expect(Math.abs(lb.width - lb.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(lb.height - ob.height)).toBeLessThanOrEqual(1);
  expect(await lang.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("50%");
  await lang.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByRole("button", { name: "Switch to English" })).toHaveText("TH");
  await expect(page.locator("label.btn", { hasText: "เปิดภาพ" })).toBeVisible();
  await page.reload();
  await expect(page.locator("label.btn", { hasText: "เปิดภาพ" })).toBeVisible();
  await page.getByRole("button", { name: /กริด 9\.37px/ }).click();
  await expect(page.getByRole("status")).toContainText("กริดเพี้ยน");
  await page.screenshot({ path: `${SHOTS}/02-thai.png` });
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("status")).toContainText("Drifting grid");
});

test("no emoji left on the page (icons instead)", async ({ page }) => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{2190}-\u{21FF}]/u;
  await page.goto("/");
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(emoji);
  await page.getByRole("button", { name: /AI prompts/ }).first().click();
  expect(await page.getByRole("dialog").innerText()).not.toMatch(emoji);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /9\.37px grid/ }).click();
  await expect.poll(() => resultSize(page)).toBe("16×16");
  // page text (except the → arrow in stats, which is not an emoji)
  expect((await page.evaluate(() => document.body.innerText)).replace(/→/g, "")).not.toMatch(emoji);
  await expect(page.locator(".toolbar svg")).toHaveCount(9);
});

test("built-in sample: detected as fake and recovered to 16×16", async ({ page }) => {
  await openFakeEgg(page);
  await expect(page.getByRole("status")).toContainText("Drifting grid");
  await page.getByLabel("Highlight mixels").check();
  await page.screenshot({ path: `${SHOTS}/03-fake-egg.png` });
});

test("integer-scaled sprite → real", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /upscaled ×12/ }).click();
  await expect(page.getByRole("status")).toContainText("clean ×12 upscale");
});

test("AI prompts: open, copy, close", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: /AI prompts/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li")).toHaveCount(6);
  await dialog.getByRole("button", { name: "Copy prompt" }).first().click();
  await expect(dialog.getByRole("button", { name: "Copied!" })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("Pixel art sprite");
  // every example image loads
  const imgs = dialog.locator("img.example");
  await expect(imgs).toHaveCount(6);
  for (let i = 0; i < 6; i++) await expect.poll(() => imgs.nth(i).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/04-prompts.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("try icon set example → auto-split into 9 images, each editable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /AI prompts/ }).first().click();
  await page.getByRole("dialog").locator("li").nth(1).getByRole("button", { name: "Try this example" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Found 9 images in this picture")).toBeVisible();
  await expect(page.locator(".split-item")).toHaveCount(10);
  // whole image first, then wait for the sheet's pixel size to be remembered
  await expect(page.getByRole("status")).toContainText(/Drifting grid/, { timeout: 15000 });
  await page.getByRole("option", { name: "Image 2" }).click();
  await expect(page.getByRole("option", { name: "Image 2" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Working…")).toHaveCount(0, { timeout: 15000 });
  await expect.poll(() => resultSize(page)).not.toBe("72×72"); // result is for image 2, not the whole sheet
  await expect(page.getByRole("status")).toContainText(/11\.[4-8]\dpx/);
  await page.screenshot({ path: `${SHOTS}/08-split.png` });
  // download all = 9 files
  const files: string[] = [];
  page.on("download", (d) => files.push(d.suggestedFilename()));
  await page.getByRole("button", { name: "Fix & download all" }).click();
  await expect.poll(() => files.length, { timeout: 15000 }).toBe(9);
  expect(files[0]).toContain("icon-set-1-pixel");
});

test("try landscape example → 160×90 as the prompt requested", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /AI prompts/ }).first().click();
  await page.getByRole("dialog").locator("li").nth(4).getByRole("button", { name: "Try this example" }).click();
  await expect.poll(() => resultSize(page), { timeout: 15000 }).toBe("160×90");
  await expect(page.locator(".split")).toHaveCount(0);
});

test("tooltip appears when hovering a tool button", async ({ page }) => {
  await openFakeEgg(page);
  const btn = page.getByRole("button", { name: /Magic eraser/ });
  await btn.hover();
  await expect.poll(() => btn.evaluate((el) => getComputedStyle(el, "::after").display)).toBe("block");
  expect(await btn.evaluate((el) => getComputedStyle(el, "::after").content)).toContain("Magic eraser");
  await page.screenshot({ path: `${SHOTS}/05-tooltip.png` });
});

test("pencil + brush size + undo/redo", async ({ page }) => {
  await openFakeEgg(page);
  const before = await resultPixel(page, 1, 1);
  await page.getByLabel("Custom color").fill("#00ff00");
  await page.getByRole("button", { name: "2", exact: true }).click(); // brush size 2
  await clickResultPixel(page, 1, 1);
  expect(await resultPixel(page, 1, 1)).toBe("0,255,0,255");
  expect(await resultPixel(page, 2, 2)).toBe("0,255,0,255"); // brush size 2 also covers the neighboring cell
  await page.keyboard.press("Meta+z");
  expect(await resultPixel(page, 1, 1)).toBe(before);
  await page.keyboard.press("Meta+Shift+z");
  expect(await resultPixel(page, 1, 1)).toBe("0,255,0,255");
});

test("custom color is saved to recent colors", async ({ page }) => {
  await openFakeEgg(page);
  await page.getByLabel("Custom color").fill("#123456");
  await page.getByLabel("Custom color").fill("#abcdef");
  const recent = page.locator(".swatches.recent button");
  await expect(recent).toHaveCount(2);
  await recent.nth(1).click();
  await clickResultPixel(page, 3, 3);
  expect(await resultPixel(page, 3, 3)).toBe("18,52,86,255");
});

test("magic eraser: removes a whole background region without touching the egg", async ({ page }) => {
  await openFakeEgg(page);
  const center = await resultPixel(page, 7, 8);
  await page.getByRole("button", { name: /Magic eraser/ }).click();
  await expect(page.getByText(/Tolerance/)).toBeVisible();
  // the top background is one connected region left to right → one click clears the whole strip
  await clickResultPixel(page, 0, 0);
  expect(isClear(await resultPixel(page, 0, 0))).toBe(true);
  expect(isClear(await resultPixel(page, 15, 0))).toBe(true);
  expect(isClear(await resultPixel(page, 15, 15))).toBe(true);
  // the bottom-left corner is cut off by the egg's outline → separate region, needs its own click
  expect(isClear(await resultPixel(page, 0, 15))).toBe(false);
  await clickResultPixel(page, 0, 15);
  expect(isClear(await resultPixel(page, 0, 15))).toBe(true);
  // the egg (yolk) is untouched
  expect(await resultPixel(page, 7, 8)).toBe(center);
  await page.screenshot({ path: `${SHOTS}/06-magic-eraser.png` });
});

test("editor: workspace larger than image, frame + size label, zoom/pan, no drawing outside the frame", async ({ page }) => {
  await openFakeEgg(page);
  const canvas = result(page);
  const box = (await canvas.boundingBox())!;
  const [x0, y0, z0] = await viewOf(page);
  // the image covers only part — empty space around it
  expect(16 * z0).toBeLessThan(Math.min(box.width, box.height) * 0.8);
  expect(x0).toBeGreaterThan(20);
  await expect(page.locator(".frame-label")).toHaveText("16×16 px · export 1× = 16×16");
  // click outside the frame → nothing changes (undo empty)
  const before = await resultPixel(page, 0, 0);
  await page.mouse.click(box.x + 5, box.y + 5);
  await page.keyboard.press("Meta+z");
  expect(await resultPixel(page, 0, 0)).toBe(before);
  // zoom-in button
  await page.getByRole("button", { name: /Zoom in/ }).last().click();
  const [, , z1] = await viewOf(page);
  expect(z1).toBeGreaterThan(z0);
  // Ctrl + mouse wheel = zoom around the cursor
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await viewOf(page))[2]).toBeGreaterThan(z1);
  // hand tool: dragging pans the image, does not draw
  await page.getByRole("button", { name: /^Hand/ }).click();
  const [hx, hy] = await viewOf(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  const [hx2, hy2] = await viewOf(page);
  expect(Math.round(hx2 - hx)).toBe(60);
  expect(Math.round(hy2 - hy)).toBe(30);
  // fit to frame → back to the original view
  await page.getByRole("button", { name: "Fit to view" }).last().click();
  expect(await viewOf(page)).toEqual([x0, y0, z0]);
  // change scale → zoom to the file's actual size + label updates
  await page.getByLabel("Scale", { exact: true }).selectOption("16");
  await expect(page.locator(".frame-label")).toHaveText("16×16 px · export 16× = 256×256");
  expect((await viewOf(page))[2]).toBe(16);
  await page.screenshot({ path: `${SHOTS}/07-editor-zoom.png` });
});

test("frame tool: change ratio, drag to resize, move image, trim, then apply/undo", async ({ page }) => {
  await openFakeEgg(page);
  const download = page.getByRole("button", { name: /^Download PNG ·/ });
  const w = page.getByRole("spinbutton", { name: "W" });
  const h = page.getByRole("spinbutton", { name: "H" });
  await page.keyboard.press("c");
  await expect(w).toHaveValue("16");
  // 16:9 → frame wider than tall, image not cropped
  await page.getByRole("button", { name: "16:9" }).click();
  const fw = +(await w.inputValue());
  const fh = +(await h.inputValue());
  expect(fw * 9).toBe(fh * 16);
  expect(fh).toBeGreaterThanOrEqual(16);
  // free ratio + typed size + center the image
  await page.getByRole("button", { name: "Free" }).click();
  await w.fill("20");
  await h.fill("20");
  await page.getByRole("button", { name: "Center", exact: true }).click();
  await expect(page.locator(".frame-label")).toHaveText("new size 20×20 px");
  // apply frame → image is 20×20, then undo back to 16×16
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(download).toHaveText("Download PNG · 20×20");
  await page.keyboard.press("Meta+z");
  await expect(download).toHaveText("Download PNG · 16×16");
  // drag the frame's bottom-right corner (starting at the image edge) out by 4 pixels
  await page.keyboard.press("c");
  const [vx, vy, z] = await viewOf(page);
  const box = (await result(page).boundingBox())!;
  await page.mouse.move(box.x + vx + 16 * z + 2, box.y + vy + 16 * z + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + vx + 20 * z + 2, box.y + vy + 20 * z + 2, { steps: 6 });
  await page.mouse.up();
  await expect(w).toHaveValue("20");
  await expect(h).toHaveValue("20");
  // arrow keys move the image within the frame, then Enter = apply
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(download).toHaveText("Download PNG · 20×20");
  await page.screenshot({ path: `${SHOTS}/08b-frame.png` });
});

test("draw from scratch: pick size, draw, switch palette, use frame, and send to Sprite to Life", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "32×32" }).click();
  await expect(page.getByRole("heading", { name: "Draw" })).toBeVisible();
  await expect(page.locator(".frame-label")).toHaveText("32×32 px · export 1× = 32×32");
  // blank canvas is fully transparent
  await expect.poll(async () => isClear(await resultPixel(page, 5, 5))).toBe(true);
  // Sweetie 16's first color is preselected → can draw right away
  await clickResultPixel(page, 5, 5);
  expect(await resultPixel(page, 5, 5)).toBe("26,28,44,255");
  // switch to Game Boy → palette bar shows 4 colors
  await page.getByRole("combobox", { name: "Palette" }).selectOption("Game Boy");
  await expect(page.locator(".swatches:not(.recent) > button")).toHaveCount(4);
  await page.locator(".swatches:not(.recent) > button").nth(2).click();
  await clickResultPixel(page, 6, 5);
  expect(await resultPixel(page, 6, 5)).toBe("139,172,15,255");
  // no settings/source panels in this mode, but Sprite to Life is there
  await expect(page.getByRole("heading", { name: "Original" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Bring it to life" })).toBeVisible();
  // custom size
  await page.getByRole("link", { name: /Back to start/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave" }).click();
  await page.getByLabel("Canvas width").fill("40");
  await page.getByLabel("Canvas height").fill("24");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: /^Download PNG ·/ })).toHaveText("Download PNG · 40×24");
  await page.waitForTimeout(300); // wait for ResizeObserver to finish sizing the canvas
  await page.locator(".swatches > button").nth(3).click();
  for (let i = 0; i < 40; i += 3) await clickResultPixel(page, i, 12);
  await page.screenshot({ path: `${SHOTS}/13-draw.png` });
});

test("footer: by breakfastz + GitHub profile + About dialog", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer).toContainText("by breakfastz");
  await expect(footer.getByRole("link", { name: "GitHub @dolphinep" })).toHaveAttribute("href", "https://github.com/dolphinep");
  await footer.getByRole("button", { name: "About" }).click();
  const about = page.getByRole("dialog", { name: /by breakfastz/ });
  await expect(about).toBeVisible();
  await expect(about.getByRole("link", { name: /YouTube/ })).toHaveAttribute("href", "https://www.youtube.com/@breakfastz");
  await expect(about.getByRole("link", { name: "GitHub @dolphinep" })).toHaveAttribute("href", "https://github.com/dolphinep");
  await expect(about.getByRole("link", { name: /breakfastz-pixel-truth/ })).toHaveAttribute("href", "https://github.com/dolphinep/breakfastz-pixel-truth");
  await page.screenshot({ path: `${SHOTS}/14-about.png` });
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
});

test("logo click: no image = go home immediately, editing = confirm first", async ({ page }) => {
  await openFakeEgg(page);
  await expect(page.getByRole("button", { name: /New image/ })).toHaveCount(0);
  const home = page.getByRole("link", { name: /Back to start/ });
  // hover logo → bacon-bonk animation plays
  await home.hover();
  expect(await page.locator(".top .logo-bacon").evaluate((el) => getComputedStyle(el).animationName)).toBe("bacon-bonk");
  await home.click();
  const dialog = page.getByRole("dialog", { name: "Leave this image?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toBeHidden();
  await expect(result(page)).toBeVisible();
  await home.click();
  await dialog.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByText(/^Drop an image/)).toBeVisible();
  // already on home → no prompt
  await home.click();
  await expect(dialog).toBeHidden();
});

test("choosing a scale updates the download button size and the file matches", async ({ page }) => {
  await openFakeEgg(page);
  const btn = page.getByRole("button", { name: /^Download PNG ·/ });
  await expect(btn).toHaveText("Download PNG · 16×16");
  let dl = page.waitForEvent("download");
  await btn.click();
  let file = await dl;
  expect(file.suggestedFilename()).toContain("16x16");
  let buf = fs.readFileSync((await file.path())!);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  expect(buf.readUInt32BE(16)).toBe(16);

  await page.getByLabel("Scale", { exact: true }).selectOption("8");
  await expect(btn).toHaveText("Download PNG · 128×128");
  dl = page.waitForEvent("download");
  await btn.click();
  buf = fs.readFileSync((await (await dl).path())!);
  expect(buf.readUInt32BE(16)).toBe(128);

  await page.getByLabel("Scale", { exact: true }).selectOption("fit");
  await expect(btn).toHaveText("Download PNG · 1024×1024");
});

const real = [
  { file: "ai-horror-monster.jpg", verdict: /No pixel grid|Drifting grid/ },
  { file: "rpg-preview.png", verdict: /clean ×4 upscale/ },
  { file: "rpg-assets-1x.png", verdict: /actual size/ },
  { file: "photo-fried-egg.jpg", verdict: /No pixel grid/ },
  { file: "eve-right.png", verdict: /./ },
];
for (const s of real) {
  test(`real image from the internet: ${s.file}`, async ({ page }) => {
    test.skip(!fs.existsSync(path.join(SAMPLES, s.file)), "sample images not downloaded (scripts/fetch-samples.sh)");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles(path.join(SAMPLES, s.file));
    await expect(page.getByRole("status")).toContainText(s.verdict, { timeout: 15000 });
    await expect(page.getByText("Working…")).toHaveCount(0, { timeout: 15000 });
    await page.screenshot({ path: `${SHOTS}/real-${s.file.replace(/\.\w+$/, "")}.png` });
    expect(errors).toEqual([]);
  });
}

test("regular image (photo): reports no grid + preset size buttons", async ({ page }) => {
  test.skip(!fs.existsSync(path.join(SAMPLES, "photo-fried-egg.jpg")), "sample images not downloaded");
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(path.join(SAMPLES, "photo-fried-egg.jpg"));
  await expect(page.getByRole("status")).toContainText("No pixel grid", { timeout: 15000 });
  await expect(page.locator(".hint")).toBeVisible();
  await page.getByRole("button", { name: "48", exact: true }).click();
  await expect.poll(() => resultSize(page)).toMatch(/^48×/);
  await page.screenshot({ path: `${SHOTS}/09-photo-48.png` });
});

test("PICO-8 palette + custom resolution", async ({ page }) => {
  await openFakeEgg(page);
  await page.getByLabel("Palette", { exact: true }).and(page.locator("select")).selectOption("preset:PICO-8");
  await expect(page.locator(".swatches:not(.recent) button")).toHaveCount(16);
  await page.getByRole("button", { name: "Manual" }).click();
  await page.locator('input[type="range"]').first().fill("32");
  await expect.poll(() => resultSize(page)).toBe("32×32");
});

test("load palette from Lospec (needs network)", async ({ page }) => {
  await openFakeEgg(page);
  await page.getByLabel("Lospec palette slug").fill("endesga-32");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByLabel("Palette", { exact: true }).and(page.locator("select"))).toHaveValue("lospec", { timeout: 15000 });
  await expect(page.locator(".swatches:not(.recent) button")).toHaveCount(32);
});

test("mobile screen has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFakeEgg(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/07-mobile.png`, fullPage: true });
});

test.describe("Sprite to Life", () => {
  test("animate: animation actually plays + eyes detected + download GIF and sprite sheet", async ({ page }) => {
    await openFakeEgg(page);
    const life = page.locator("section.life");
    await expect(life.getByRole("heading", { name: "Bring it to life" })).toBeVisible();
    await expect(life.getByText(/Found 2 eye/)).toBeVisible();
    const stage = life.locator(".life-stage canvas");
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add((await stage.getAttribute("data-frame")) ?? "");
      await page.waitForTimeout(60);
    }
    expect(seen.size).toBeGreaterThan(1);
    await life.getByRole("button", { name: "Blink" }).click();
    await life.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/10-life-animate.png` });
    let dl = page.waitForEvent("download");
    await life.getByRole("button", { name: "Download GIF" }).click();
    let buf = fs.readFileSync((await (await dl).path())!);
    expect(buf.subarray(0, 6).toString()).toBe("GIF89a");
    dl = page.waitForEvent("download");
    await life.getByRole("button", { name: "Sprite sheet PNG" }).click();
    buf = fs.readFileSync((await (await dl).path())!);
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
  });

  test("3D: voxel model actually renders + download .glb", async ({ page }) => {
    await openFakeEgg(page);
    const life = page.locator("section.life");
    await life.getByRole("tab", { name: "3D" }).click();
    await expect(life.locator(".voxel[data-ready='1']")).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(400);
    // yolk-colored pixels actually on screen (WebGL has rendered)
    const yolk = await life.locator(".voxel canvas").evaluate((c: HTMLCanvasElement) => {
      const t = document.createElement("canvas");
      t.width = c.width;
      t.height = c.height;
      const ctx = t.getContext("2d")!;
      ctx.drawImage(c, 0, 0);
      const d = ctx.getImageData(0, 0, t.width, t.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 90) n++;
      return n;
    });
    expect(yolk).toBeGreaterThan(50);
    await life.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/11-life-3d.png` });
    const dl = page.waitForEvent("download");
    await life.getByRole("button", { name: /Download 3D/ }).click();
    const buf = fs.readFileSync((await (await dl).path())!);
    expect(buf.subarray(0, 4).toString()).toBe("glTF");
  });

  test("play: press right to walk, press jump to go airborne", async ({ page }) => {
    await openFakeEgg(page);
    const life = page.locator("section.life");
    await life.getByRole("tab", { name: "Play" }).click();
    const game = life.locator(".life-stage.play canvas");
    await expect(game).toHaveAttribute("data-x", /\d+/);
    await game.focus();
    const x0 = Number(await game.getAttribute("data-x"));
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowRight");
    const x1 = Number(await game.getAttribute("data-x"));
    expect(x1).toBeGreaterThan(x0 + 40);
    await page.keyboard.down("Space");
    await expect.poll(() => game.getAttribute("data-ground"), { timeout: 2000 }).toBe("0");
    await page.keyboard.up("Space");
    await expect.poll(() => game.getAttribute("data-ground"), { timeout: 3000 }).toBe("1");
    // on-screen buttons (mobile) — restart the level first so we don't fall into the first pit mid-test
    await life.getByRole("button", { name: "Restart" }).click();
    await expect.poll(async () => Number(await game.getAttribute("data-x"))).toBeLessThan(60);
    const xs = Number(await game.getAttribute("data-x"));
    const right = life.getByRole("button", { name: "Move right" });
    await right.scrollIntoViewIfNeeded();
    const box = (await right.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    expect(Number(await game.getAttribute("data-x"))).toBeGreaterThan(xs + 20);
    await life.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/12-life-play.png` });
  });
});
