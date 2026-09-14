import { test, expect } from '@playwright/test';
const adminPath = '/gestion-tests-12345678901234567890';

for (const [season, generatedAt, expectedRange] of [
  ['summer', '2026-09-14T12:34:00Z', '14:05 – 14:34'],
  ['winter', '2026-01-14T12:34:00Z', '13:05 – 13:34']
]) {
  test(`${season}: traffic has 30 minute buckets and explicit Paris/UTC time`, async ({ browser }) => {
    // A different browser timezone ensures labels follow the chosen chart timezone.
    const context = await browser.newContext({ timezoneId: 'America/New_York', viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const now = Date.parse(generatedAt);
    const data = {
      generatedAt, visits30m: 37, visitsToday: 2533, visitsMonth: 18726, reportsTotal: 12,
      online: { connected: 42, waiting: 6, conversations: 18 }, today: { pageviews: 2533, peak: 78 },
      // Only three active minutes: empty intervals must retain their place on the axis.
      visitSeries: [{ minute: new Date(now - 29 * 60000).toISOString(), visits: 8 }, { minute: new Date(now - 10 * 60000).toISOString(), visits: 17 }, { minute: generatedAt, visits: 12 }],
      countries: [{ country: 'FR', visits: 1560 }, { country: 'US', visits: 970 }, { country: 'GB', visits: 460 }, { country: 'DE', visits: 320 }],
      daily: Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - i * 86400000).toISOString().slice(0, 10), pageviews: 100 + i * 17, connections: 80 + i * 8, matches: 26 + i * 4, peak: 18, reports: 1 })),
      monthly: [{ month: generatedAt.slice(0, 7), pageviews: 18726, connections: 9500, visitors: 1200, peak: 78, matches: 2540, reports: 12 }],
      reports: [], contacts: [], totalReports: 0, bans: [], audit: [],
      policy: { operator: 'Test operator', contact: 'test@example.com', address: '', hosting: '', retentionDays: 30 }
    };
    await page.route('**' + adminPath + '/api/**', route => route.fulfill({ json: route.request().url().endsWith('/session') ? { csrf: 'test-token' } : data }));
    try {
      await page.goto(adminPath);
      await expect(page.locator('#dashboard')).toBeVisible();
      await expect(page.locator('#trafficRange')).toContainText(expectedRange + ' · Europe/Paris');
      await expect(page.locator('#trafficChart .chart-target')).toHaveCount(30);
      await expect(page.locator('#trafficChart .chart-target').nth(1)).toHaveAttribute('aria-label', /0 visits/);
      await page.locator('#trafficChart .chart-target').last().focus();
      await expect(page.locator('#trafficChart .chart-readout')).toContainText('12 visits');
      await page.locator('#trafficBars').click();
      await expect(page.locator('#trafficBars')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#trafficChart .chart-column')).toHaveCount(30);
      expect(await page.locator('#trafficChart .chart-column').nth(1).getAttribute('height')).toBe('0');
      await page.locator('#chartTimezone').selectOption('UTC');
      await expect(page.locator('#trafficRange')).toContainText('12:05 – 12:34 · UTC');
      await page.locator('#activityMetric').selectOption('matches');
      await expect(page.locator('#activityChart .chart-target').last()).toHaveAttribute('aria-label', /26 matches/);
      await page.locator('#operator').fill('Unsaved draft');
      data.online.connected = 43;
      await expect(page.locator('#live .card').filter({ hasText: 'People online' }).locator('strong')).toHaveText('43', { timeout: 12000 });
      await expect(page.locator('#operator')).toHaveValue('Unsaved draft');
      await page.locator('#chartTimezone').selectOption('Europe/Paris'); await page.locator('#trafficLine').click();
      await page.locator('#activityMetric').selectOption('pageviews');
      await page.evaluate(() => scrollTo(0, 0));
      if (season === 'summer') {
        await page.screenshot({ path: 'test-results/admin-overview-desktop.png' });
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: 'test-results/admin-overview-mobile.png', fullPage: true });
      }
      data.visitSeries = []; data.visits30m = 0; data.countries = [];
      await page.locator('#refresh').click();
      await expect(page.locator('#countries')).toContainText('No country data');
      await expect(page.locator('#trafficChart .chart-target')).toHaveCount(30);
      for (const label of await page.locator('#trafficChart .chart-target').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))) expect(label).toMatch(/0 visits$/);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
