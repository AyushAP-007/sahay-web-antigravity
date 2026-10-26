import { chromium } from 'playwright';

async function checkBrowser() {
  console.log("Launching browser to inspect http://localhost:8080/journey...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log(`[BROWSER UNCAUGHT ERROR]:`, err.message));

  await page.goto('http://localhost:8080/journey', { waitUntil: 'networkidle' });

  // Take screenshot
  await page.screenshot({ path: 'journey-initial.png' });
  console.log("Saved journey-initial.png");

  // Check if map container exists
  const mapElement = await page.$('.leaflet-container, [ref="hostRef"], div[style*="height: 250px"]');
  console.log("Map element on initial page:", mapElement ? "Found" : "NOT found (routes.length is 0)");

  await browser.close();
}

checkBrowser().catch(console.error);
