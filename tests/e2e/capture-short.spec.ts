// High-res mobile screenshots of the app for the promo video.
// CAPTURE=1 CAPTURE_OUT=<dir> npx playwright test capture-short   (default dir: tests/.capture)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CAPTURE_OUT ? path.resolve(process.env.CAPTURE_OUT) : path.resolve(__dirname, "../.capture");

test.skip(!process.env.CAPTURE, "set CAPTURE=1 to take promo screenshots");
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

test("mobile screenshots for the Short", async ({ page }) => {
  await page.goto("/?lang=th");
  await page.screenshot({ path: `${OUT}/app-empty.png` });
  await page.getByRole("button", { name: /Prompt สำหรับ AI/ }).first().click();
  await page.getByRole("dialog").locator("li").nth(1).getByRole("button", { name: "ลองตัวอย่างนี้" }).click();
  await expect(page.getByRole("status")).toContainText("กริดเพี้ยน", { timeout: 15000 });
  await expect(page.getByText("กำลังคำนวณ…")).toHaveCount(0, { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/app-split.png` });
  // scroll to the verdict badge + source image
  await page.getByRole("status").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.getByLabel("ไฮไลต์ mixel").check();
  await page.mouse.click(5, 5); // move focus/hover off the button
  await page.screenshot({ path: `${OUT}/app-verdict.png` });
  // result
  await page.getByRole("img", { name: "Pixel Truth result" }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -170));
  await page.screenshot({ path: `${OUT}/app-result.png` });
});
