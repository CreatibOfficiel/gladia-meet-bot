import { Page } from "playwright";
import { log } from "./index";

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
    
    // In a real implementation, you might want to save this to a specific directory
    // or upload to a cloud storage service. For now, we'll just log it.
    log(`Debug screenshot taken: ${filename} (reason: ${reason}) - ${screenshot.length} bytes`);
    
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