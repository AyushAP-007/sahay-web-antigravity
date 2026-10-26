import { chromium } from 'playwright';

async function checkUrl() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:8080/journey');
  console.log("Current URL after navigating to /journey:", page.url());
  const bodyText = await page.innerText('body');
  console.log("Page title / text snippet:", bodyText.slice(0, 300));
  await browser.close();
}

checkUrl().catch(console.error);
