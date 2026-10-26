/**
 * Full end-to-end browser audit of the Journey Planner.
 * Tests: map visibility, route analysis, directions, scoring, journey start, zoom stability.
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = "http://localhost:8080";
const SCREENSHOTS_DIR = ".";

async function screenshot(page, name) {
  const path = `${SCREENSHOTS_DIR}/audit-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`📸 Saved ${path}`);
  return path;
}

async function main() {
  console.log("🔍 Starting full Journey Planner audit...\n");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone-like mobile viewport
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
  });
  const page = await context.newPage();

  const consoleMessages = [];
  const networkErrors = [];
  page.on("console", (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on("requestfailed", (req) => {
    networkErrors.push({ url: req.url(), error: req.failure()?.errorText });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Navigate to home, activate demo user
  // ═══════════════════════════════════════════════════════════════════
  console.log("STEP 1: Opening home page and activating demo user...");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 15000 });
  await screenshot(page, "01-home");

  // Click the "Open the companion" button for Asha demo
  const openBtn = page.locator('button:has-text("Open the companion")');
  if (await openBtn.isVisible({ timeout: 3000 })) {
    await openBtn.click();
    await page.waitForTimeout(1500);
    console.log("  ✅ Clicked 'Open the companion'");
  } else {
    console.log("  ⚠️ No 'Open the companion' button found, might already be authenticated");
  }
  await screenshot(page, "02-after-auth");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Navigate to Journey page
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 2: Navigating to /journey...");
  await page.goto(`${BASE}/journey`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000); // Let Leaflet initialize
  await screenshot(page, "03-journey-initial");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Check if map container exists and has dimensions
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 3: Checking map container...");
  const mapInfo = await page.evaluate(() => {
    const leafletContainers = document.querySelectorAll(".leaflet-container");
    const results = [];
    leafletContainers.forEach((el) => {
      const rect = el.getBoundingClientRect();
      results.push({
        width: rect.width,
        height: rect.height,
        top: rect.top,
        visible: rect.width > 0 && rect.height > 0,
        hasTiles: el.querySelectorAll(".leaflet-tile").length,
        hasLayers: el.querySelectorAll(".leaflet-overlay-pane path, .leaflet-overlay-pane canvas").length,
      });
    });
    return {
      leafletContainerCount: leafletContainers.length,
      containers: results,
      // Also check for the host div
      hostDivs: Array.from(document.querySelectorAll('[style*="height"]')).filter(
        (el) => el.style.height === "250px" || el.style.minHeight === "250px"
      ).length,
    };
  });

  console.log(`  Leaflet containers found: ${mapInfo.leafletContainerCount}`);
  if (mapInfo.containers.length > 0) {
    mapInfo.containers.forEach((c, i) => {
      console.log(`  Container ${i}: ${c.width}x${c.height}, visible=${c.visible}, tiles=${c.hasTiles}, layers=${c.hasLayers}`);
    });
  }
  console.log(`  Host divs with height: ${mapInfo.hostDivs}`);

  const mapVisible = mapInfo.containers.some((c) => c.visible && c.hasTiles > 0);
  console.log(`  📍 MAP VISIBLE BEFORE ANALYSIS: ${mapVisible ? "✅ YES" : "❌ NO"}`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Fill in origin and destination
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 4: Entering origin and destination...");
  
  // Find the From input
  const fromInput = page.locator('input[placeholder*="Start point"]');
  const toInput = page.locator('input[placeholder*="Destination"]');
  
  if (await fromInput.isVisible({ timeout: 3000 })) {
    await fromInput.fill("Shivajinagar");
    console.log("  Typed 'Shivajinagar' in From");
    await page.waitForTimeout(1500); // Wait for autocomplete
    
    // Try to pick a suggestion
    const fromSuggestion = page.locator('button:has-text("Shivajinagar")').first();
    if (await fromSuggestion.isVisible({ timeout: 5000 })) {
      await fromSuggestion.click();
      console.log("  ✅ Picked origin suggestion");
    } else {
      console.log("  ⚠️ No origin suggestion appeared, will try direct search");
    }
    
    await page.waitForTimeout(500);
    
    await toInput.fill("Hinjewadi");
    console.log("  Typed 'Hinjewadi' in To");
    await page.waitForTimeout(1500);
    
    const toSuggestion = page.locator('button:has-text("Hinjewadi")').first();
    if (await toSuggestion.isVisible({ timeout: 5000 })) {
      await toSuggestion.click();
      console.log("  ✅ Picked destination suggestion");
    } else {
      console.log("  ⚠️ No destination suggestion appeared");
    }
  } else {
    console.log("  ❌ From input not found!");
  }

  await screenshot(page, "04-inputs-filled");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Click "Analyze routes"
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 5: Clicking 'Analyze routes'...");
  const analyzeBtn = page.locator('[data-testid="find-safe-route"]');
  if (await analyzeBtn.isVisible({ timeout: 3000 })) {
    await analyzeBtn.click();
    console.log("  Clicked Analyze routes, waiting for results...");
    
    // Wait for the analysis to complete (look for route cards or timeout)
    try {
      await page.waitForSelector('text=Candidate Route Comparison', { timeout: 45000 });
      console.log("  ✅ Route comparison appeared!");
    } catch {
      console.log("  ❌ Route comparison did not appear within 45s");
      
      // Check for error messages
      const errorText = await page.locator('.text-danger').textContent().catch(() => null);
      if (errorText) console.log(`  Error displayed: "${errorText}"`);
    }
  }

  await page.waitForTimeout(2000); // Let map update
  await screenshot(page, "05-after-analysis");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: Check map after analysis
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 6: Checking map after route analysis...");
  const mapAfter = await page.evaluate(() => {
    const containers = document.querySelectorAll(".leaflet-container");
    const results = [];
    containers.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const paths = el.querySelectorAll(".leaflet-overlay-pane path");
      const circles = el.querySelectorAll(".leaflet-overlay-pane circle");
      results.push({
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0,
        tileCount: el.querySelectorAll(".leaflet-tile").length,
        polylineCount: paths.length,
        circleMarkerCount: circles.length,
        svgLayerPresent: !!el.querySelector(".leaflet-overlay-pane svg"),
      });
    });
    return results;
  });

  if (mapAfter.length > 0) {
    mapAfter.forEach((c, i) => {
      console.log(`  Container ${i}: ${c.width}x${c.height}, tiles=${c.tileCount}, polylines=${c.polylineCount}, circles=${c.circleMarkerCount}`);
    });
    const hasRoutes = mapAfter.some((c) => c.polylineCount > 0);
    const hasTiles = mapAfter.some((c) => c.tileCount > 0);
    console.log(`  📍 MAP TILES AFTER ANALYSIS: ${hasTiles ? "✅ YES" : "❌ NO"}`);
    console.log(`  📍 ROUTE POLYLINES VISIBLE: ${hasRoutes ? "✅ YES" : "❌ NO"}`);
  } else {
    console.log("  ❌ No leaflet containers found after analysis!");
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: Check route cards content
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 7: Inspecting route cards...");
  const routeCards = await page.evaluate(() => {
    const cards = [];
    // Look for Night Activity badges
    const badges = document.querySelectorAll('[class*="badge"]');
    badges.forEach((b) => {
      if (b.textContent?.includes("Night Activity")) {
        cards.push(b.textContent.trim());
      }
    });
    
    // Check for zero/unavailable clutter
    const allText = document.body.innerText;
    const hasZeroPlaces = allText.includes("Open places: 0");
    const hasZeroHelp = allText.includes("Open help points: 0");
    const hasCameraUnavailable = allText.includes("Data unavailable");
    const hasZeroCameras = allText.includes("Mapped cameras: 0");
    
    return {
      nightActivityBadges: cards,
      hasZeroPlaces,
      hasZeroHelp,
      hasCameraUnavailable,
      hasZeroCameras,
      clutter: hasZeroPlaces || hasZeroHelp || hasCameraUnavailable || hasZeroCameras,
    };
  });

  console.log(`  Night Activity badges: ${JSON.stringify(routeCards.nightActivityBadges)}`);
  console.log(`  Zero/unavailable clutter visible: ${routeCards.clutter ? "❌ YES (still has clutter)" : "✅ NO (clean)"}`);
  if (routeCards.hasZeroPlaces) console.log("    - 'Open places: 0' visible");
  if (routeCards.hasZeroHelp) console.log("    - 'Open help points: 0' visible");
  if (routeCards.hasCameraUnavailable) console.log("    - 'Data unavailable' visible");
  if (routeCards.hasZeroCameras) console.log("    - 'Mapped cameras: 0' visible");

  // Check if scores are all identical
  const scores = routeCards.nightActivityBadges.map((b) => {
    const match = b.match(/(\d+)\/100/);
    return match ? parseInt(match[1]) : null;
  }).filter((s) => s !== null);
  
  if (scores.length > 1) {
    const allSame = scores.every((s) => s === scores[0]);
    console.log(`  Scores: ${scores.join(", ")} - ${allSame ? "⚠️ ALL IDENTICAL" : "✅ DIFFERENTIATED"}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: Check turn-by-turn directions
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 8: Checking turn-by-turn directions...");
  const directionsBtn = page.locator('button:has-text("View turn-by-turn")').first();
  if (await directionsBtn.isVisible({ timeout: 3000 })) {
    await directionsBtn.click();
    await page.waitForTimeout(500);
    console.log("  ✅ Directions toggle found and clicked");
    
    const stepsCount = await page.locator('text=/^Start on/').count() + 
                        await page.locator('text=/^Turn /').count() +
                        await page.locator('text=/^Continue/').count();
    console.log(`  Navigation steps visible: ${stepsCount}`);
    await screenshot(page, "06-directions-open");
  } else {
    console.log("  ❌ No 'View turn-by-turn' button found");
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 9: Select an alternative route
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 9: Selecting an alternative route...");
  const altRouteBtn = page.locator('text=Fastest').first();
  if (await altRouteBtn.isVisible({ timeout: 3000 })) {
    await altRouteBtn.click();
    await page.waitForTimeout(1000);
    console.log("  ✅ Clicked alternative route 'Fastest'");
    await screenshot(page, "07-alt-selected");
  } else {
    // Try any route card that's not the first
    const routeButtons = page.locator('button:has-text("Night Activity")');
    const count = await routeButtons.count();
    console.log(`  Found ${count} route selection buttons`);
    if (count > 1) {
      await routeButtons.nth(1).click();
      await page.waitForTimeout(1000);
      console.log("  ✅ Clicked second route card");
      await screenshot(page, "07-alt-selected");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 10: Start a journey and check map stability
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 10: Starting journey and checking map stability...");
  
  // Scroll to the start button
  const startBtn = page.locator('[data-testid="start-journey-button"]');
  if (await startBtn.isVisible({ timeout: 3000 })) {
    // Take a "before" screenshot and record map viewport
    const viewportBefore = await page.evaluate(() => {
      const c = document.querySelector(".leaflet-container");
      if (!c) return null;
      // Try to read transform of tile pane
      const tilePane = c.querySelector(".leaflet-tile-pane");
      return tilePane ? tilePane.style.transform : "no-tile-pane";
    });
    
    await startBtn.click();
    console.log("  Clicked 'Watch this route'...");
    await page.waitForTimeout(500);
    
    // Track viewport changes over 5 seconds
    const viewportChanges = [];
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const vp = await page.evaluate(() => {
        const c = document.querySelector(".leaflet-container");
        if (!c) return "no-container";
        const tilePane = c.querySelector(".leaflet-tile-pane");
        return tilePane ? tilePane.style.transform : "no-tile-pane";
      });
      viewportChanges.push(vp);
    }
    
    const uniqueViewports = [...new Set(viewportChanges)];
    console.log(`  Viewport changes in 5s: ${uniqueViewports.length} unique states`);
    console.log(`  📍 MAP STABILITY: ${uniqueViewports.length <= 2 ? "✅ STABLE" : "⚠️ UNSTABLE (" + uniqueViewports.length + " changes)"}`);
    
    await screenshot(page, "08-journey-active");
  } else {
    console.log("  ❌ Start journey button not found");
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 11: Check other app pages still work
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nSTEP 11: Checking other pages...");
  const pagesToCheck = ["/", "/contacts", "/history", "/settings"];
  for (const path of pagesToCheck) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 10000 });
      const title = await page.title();
      console.log(`  ${path}: ✅ loaded (title: ${title})`);
    } catch (err) {
      console.log(`  ${path}: ❌ failed: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("AUDIT SUMMARY");
  console.log("═".repeat(60));
  
  const warnings = consoleMessages.filter((m) => m.type === "warning");
  const errors = consoleMessages.filter((m) => m.type === "error");
  console.log(`\nConsole warnings: ${warnings.length}`);
  warnings.forEach((w) => console.log(`  ⚠️ ${w.text.substring(0, 120)}`));
  console.log(`Console errors: ${errors.length}`);
  errors.forEach((e) => console.log(`  ❌ ${e.text.substring(0, 120)}`));
  console.log(`Network errors: ${networkErrors.length}`);
  networkErrors.forEach((e) => console.log(`  ❌ ${e.url.substring(0, 100)} -> ${e.error}`));

  await browser.close();
  console.log("\n✅ Audit complete.");
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
