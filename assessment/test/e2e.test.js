// Real-browser regression coverage for the screen-to-screen flow in main.js.
// Unlike the rest of test/*.test.js (pure functions, no DOM), this drives an
// actual Chromium tab against a real Vite dev server with pointer/click
// events, because the bugs it guards against only manifest during real DOM
// construction and event delivery (see git history around "continue without
// camera" for prior fixes that unit tests alone did not catch).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

async function withApp(fn) {
  const server = await createServer({ root: projectRoot, server: { host: '127.0.0.1' } });
  await server.listen();
  const port = server.httpServer.address().port;
  const browser = await chromium.launch();
  try {
    await fn({ url: `http://127.0.0.1:${port}/`, browser });
  } finally {
    await browser.close();
    await server.close();
  }
}

async function gotoAdultConsent(page, url) {
  await page.goto(url);
  await page.getByText('An adult').click();
  await page.waitForSelector('#consent-heading');
}

async function fillAcknowledgements(page) {
  await page.check('input[name="retinal-option"][value="decline-both"]');
  await page.fill('#retinal-name', 'Jane Doe');
  await page.fill('#retinal-date', '2026-01-15');
  const checkboxes = page.locator('.consent-check-row input[type="checkbox"]');
  await checkboxes.nth(0).check();
  await page.fill('#financial-name', 'Jane Doe');
  await page.fill('#financial-date', '2026-01-15');
  await checkboxes.nth(1).check();
}

test('adult + continue without camera reaches Patient agreements, and agreements submit reaches intake', async () => {
  await withApp(async ({ url, browser }) => {
    const pageErrors = [];
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(err));

    await gotoAdultConsent(page, url);
    await page.click('#consent-check');

    const continueWithoutBtn = page.locator('button:has-text("Continue without camera")');
    assert.equal(await continueWithoutBtn.isDisabled(), false, 'no-camera action should be enabled once consent is checked');
    await continueWithoutBtn.click();

    await page.waitForSelector('h2', { timeout: 2000 });
    const heading = await page.locator('#app-root h2').first().textContent();
    assert.deepEqual(pageErrors.map((e) => e.message), [], 'continuing without camera must not throw');
    assert.match(heading, /Patient agreements/, 'must land on the agreements screen, not stay stuck on consent');

    await fillAcknowledgements(page);
    const continueBtn = page.locator('#app-root button:has-text("Continue")');
    assert.equal(await continueBtn.isDisabled(), false, 'Continue should enable once every required agreement field is filled');
    await continueBtn.click();

    await page.waitForSelector('#intake-heading', { timeout: 2000 });
    assert.deepEqual(pageErrors.map((e) => e.message), [], 'submitting agreements must not throw');

    await context.close();
  });
});

test('camera denial shows a still-visible no-camera choice that proceeds to Patient agreements', async () => {
  await withApp(async ({ url, browser }) => {
    const pageErrors = [];
    // No permissions granted and no fake-device flags: getUserMedia rejects, simulating denial.
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(err));

    await gotoAdultConsent(page, url);
    await page.click('#consent-check');
    await page.locator('button:has-text("Enable camera & continue")').click();

    await page.waitForSelector('.error-text', { timeout: 5000 });
    const continueWithoutBtn = page.locator('button:has-text("Continue without camera")');
    await continueWithoutBtn.waitFor({ state: 'visible' });
    assert.equal(await continueWithoutBtn.isVisible(), true, 'no-camera choice must still be visible after denial, not silently forwarded');
    assert.equal(await continueWithoutBtn.isDisabled(), false);

    await continueWithoutBtn.click();
    await page.waitForSelector('h2', { timeout: 2000 });
    const heading = await page.locator('#app-root h2').first().textContent();
    assert.deepEqual(pageErrors.map((e) => e.message), []);
    assert.match(heading, /Patient agreements/);

    await context.close();
  });
});

test('granted camera keeps blink tracking active across the agreements screen', async () => {
  await withApp(async ({ url, browser: _browser }) => {
    const pageErrors = [];
    const cameraBrowser = await chromium.launch({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    });
    try {
      const context = await cameraBrowser.newContext({ permissions: ['camera'] });
      const page = await context.newPage();
      page.on('pageerror', (err) => pageErrors.push(err));

      await gotoAdultConsent(page, url);
      await page.click('#consent-check');
      await page.locator('button:has-text("Enable camera & continue")').click();
      await page.waitForSelector('#intake-heading, #retinal-name', { timeout: 5000 });
      assert.deepEqual(pageErrors.map((e) => e.message), [], 'a successful camera grant must not throw while advancing past consent');

      const heading = await page.locator('#app-root h2').first().textContent();
      assert.match(heading, /Patient agreements/, 'must advance past consent instead of bouncing back on an unrelated render error');

      const trackingStatus = await page.locator('#tracking-status').textContent();
      assert.match(trackingStatus, /active locally/i, 'blink tracking must still be running after advancing past consent');

      await context.close();
    } finally {
      await cameraBrowser.close();
    }
  });
});

test('intake Continue and reading Submit answers progress the later flow by keyboard and pointer', async () => {
  await withApp(async ({ url, browser }) => {
    const pageErrors = [];
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(err));

    await gotoAdultConsent(page, url);
    await page.click('#consent-check');
    await page.locator('button:has-text("Continue without camera")').click();
    await page.waitForSelector('#intake-heading, #retinal-name', { timeout: 2000 });
    await fillAcknowledgements(page);
    await page.locator('#app-root button:has-text("Continue")').click();

    await page.waitForSelector('#intake-heading', { timeout: 2000 });
    await page.fill('#intake-last', 'Doe');
    await page.fill('#intake-first', 'Jane');
    await page.fill('#intake-dob', '1990-01-01');

    const intakeContinueBtn = page.locator('#app-root button:has-text("Continue")');
    assert.equal(await intakeContinueBtn.isDisabled(), false);
    await intakeContinueBtn.focus();
    await page.keyboard.press('Enter');

    await page.waitForSelector('#reading-heading', { timeout: 2000 });
    await page.locator('button:has-text("Submit answers")').click();

    await page.waitForSelector('#acuity-heading', { timeout: 2000 });
    assert.deepEqual(pageErrors.map((e) => e.message), [], 'intake -> reading -> vision progression must not throw');

    await context.close();
  });
});
