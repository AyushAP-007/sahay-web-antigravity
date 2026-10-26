import { chromium } from 'playwright';

async function checkJourneyFlow() {
  console.log("Starting full Playwright flow on http://localhost:8080/journey...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[CONSOLE ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log(`[PAGEERROR]:`, err.message));

  await page.goto('http://localhost:8080/journey', { waitUntil: 'networkidle' });

  // Type Origin: Fergusson College Road
  const fromInput = page.locator('input[placeholder="Start point in Pune"]');
  await fromInput.fill("Fergusson College Road");
  await page.waitForTimeout(600);

  // If suggestion appears, click it
  const suggestion = page.locator('button:has-text("Fergusson College Road")').first();
  if (await suggestion.isVisible()) {
    await suggestion.click();
    console.log("Clicked origin suggestion");
  }

  // Type Destination: Pune Railway Station
  const toInput = page.locator('input[placeholder="Destination in Pune"]');
  await toInput.fill("Pune Railway Station");
  await page.waitForTimeout(600);

  const toSuggestion = page.locator('button:has-text("Pune")').first();
  if (await toSuggestion.isVisible()) {
    await toSuggestion.click();
    console.log("Clicked destination suggestion");
  }

  // Click Analyze routes
  const analyzeBtn = page.locator('button[data-testid="find-safe-route"]');
  console.log("Clicking Analyze routes button...");
  await analyzeBtn.click();

  // Wait for results to appear
  try {
    await page.waitForSelector('text=Candidate Route Comparison', { timeout: 25000 });
    console.log("Candidate Route Comparison section appeared!");
  } catch (e) {
    console.log("Timeout waiting for comparison:", e.message);
  }

  await page.screenshot({ path: 'journey-after-search.png' });
  console.log("Saved journey-after-search.png");

  // Check map visibility
  const mapContainer = await page.$('.leaflet-container');
  console.log("Is Leaflet container present in DOM:", !!mapContainer);

  if (mapContainer) {
    const box = await mapContainer.boundingBox();
    console.log("Map bounding box:", box);

    const tilesCount = await page.locator('.leaflet-tile-loaded').count();
    console.log("Loaded map tiles count:", tilesCount);

    const polylines = await page.locator('.leaflet-pane svg path').count();
    console.log("SVG polylines rendered on map:", polylines);
  }

  await browser.close();
}

checkJourneyFlow().catch(console.error);
