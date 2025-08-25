import { Page } from "playwright";
import { log } from "../utils";
import * as fs from "fs";
import * as path from "path";

/**
 * Take a debug screenshot for troubleshooting
 * @param page - The Playwright page
 * @param filename - Name for the screenshot file
 * @param reason - Reason for taking the screenshot
 */
export async function takeDebugScreenshot(
  page: Page, 
  filename: string, 
  reason: string = "debug"
): Promise<void> {
  try {
    if (!page || page.isClosed()) {
      log(`Cannot take screenshot: page is ${page ? 'closed' : 'null'}`);
      return;
    }

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true,
    });
    
    // Create screenshots directory if it doesn't exist
    const screenshotsDir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Save screenshot to file
    const filePath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filePath, screenshot);
    
    log(`Debug screenshot saved: ${filePath} (reason: ${reason}) - ${screenshot.length} bytes`);
    
  } catch (error: any) {
    log(`Error taking debug screenshot ${filename}: ${error.message}`);
  }
}

/**
 * Take a screenshot on retry failure for debugging
 * @param page - The Playwright page
 * @param actionName - Name of the failed action
 */
export async function takeRetryFailureScreenshot(
  page: Page, 
  actionName: string
): Promise<void> {
  const filename = `retry-failure-${actionName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
  await takeDebugScreenshot(page, filename, `retry_failure_${actionName}`);
}