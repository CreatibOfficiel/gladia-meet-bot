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
  // Check if screenshots are enabled
  const enableScreenshots = process.env.BOT_ENABLE_SCREENSHOTS !== 'false';
  if (!enableScreenshots) {
    log(`Screenshots disabled - skipping: ${filename} (reason: ${reason})`);
    return;
  }

  try {
    if (!page || page.isClosed()) {
      log(`Cannot take screenshot: page is ${page ? 'closed' : 'null'}`);
      return;
    }

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true,
    });
    
    // Use persistent screenshots directory from environment or fallback to local
    const screenshotsDir = process.env.BOT_SCREENSHOTS_DIR || path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Add meeting ID and session UID to filename for better tracking
    const meetingId = process.env.BOT_MEETING_ID || 'unknown';
    const sessionUid = process.env.BOT_SESSION_UID || 'unknown';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const enhancedFilename = `${meetingId}_${sessionUid}_${timestamp}_${filename}`;
    
    // Save screenshot to file
    const filePath = path.join(screenshotsDir, enhancedFilename);
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