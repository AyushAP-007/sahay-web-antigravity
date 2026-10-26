import { chromium } from 'playwright';

async function checkJourneyFlowWithAuth() {
  console.log("Starting full Playwright flow with auth on http://localhost:8080...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[CONSOLE ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log(`[PAGEERROR]:`, err.message));

  // 1. Go to root page and click "Open the companion" (enters Asha demo)
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  const openDemoBtn = page.locator('button[data-testid="open-demo-button"]');
  await openDemoBtn.click();
  await page.waitForTimeout(500);

  // 2. Navigate to Journey page
  await page.goto('http://localhost:8080/journey', { waitUntil: 'networkidle' });
  console.log("On journey page, URL:", page.url());
  await page.screenshot({ path: 'journey-authenticated.png' });

  // 3. Fill Origin and Destination
  const fromInput = page.locator('input[placeholder="Start point in Pune"]');
  await fromInput.fill("Fergusson College Road");
  await page.waitForTimeout(700);

  // Click suggestion if visible
  const fromSugg = page.locator('button:has-text("Fergusson")').first();
  if (await fromSugg.isVisible()) {
    await fromSugg.click();
    console.log("Clicked origin suggestion");
  }

  const toInput = page.locator('input[placeholder="Destination in Pune"]');
  await toInput.fill("Pune Railway Station");
  await page.waitForTimeout(700);

  const toSugg = page.locator('button:has-text("Pune")').first();
  if (await toSugg.isVisible()) {
    await toSugg.click();
    console.log("Clicked destination suggestion");
  }

  // 4. Click Analyze routes
  const analyzeBtn = page.locator('button[data-testid="find-safe-route"]');
  console.log("Clicking Analyze routes button...");
  await analyzeBtn.click();

  // Wait for results
  try {
    await page.waitForSelector('text=Candidate Route Comparison', { timeout: 25000 });
    console.log("Candidate Route Comparison section appeared!");
  } catch (e) {
    console.log("Timeout waiting for comparison:", e.message);
  }

  // Allow Leaflet tile rendering
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'journey-after-analysis.png' });
  console.log("Saved journey-after-analysis.png");

  // Inspect map
  const mapContainer = await page.$('.leaflet-container');
  console.log("Is Leaflet container present:", !!mapContainer);

  if (mapContainer) {
    const box = await mapContainer.boundingBox();
    console.log("Map dimensions (boundingBox):", box);

    const tilesLoaded = await page.locator('.leaflet-tile-loaded').count();
    console.log("Loaded tiles count:", tilesLoaded);

    const polylines = await page.locator('.leaflet-pane svg path').count();
    console.log("SVG polylines count:", polylines);

    const markers = await page.locator('.leaflet-marker-pane, .leaflet-overlay-pane path').count();
    console.log("Markers / overlay elements count:", markers);
  }

  await browser.close();
}

checkJourneyFlowWithAuth().catch(console.error);
