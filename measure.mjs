import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
const info = await page.evaluate(() => {
  const doc = document.documentElement;
  const overflowers = [...document.querySelectorAll('*')]
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 120),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      };
    })
    .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
    .slice(0, 30);
  return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, overflowers };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/opencode/chor-mobile-fixed.png', fullPage: false });
await browser.close();
