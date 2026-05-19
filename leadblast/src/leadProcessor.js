/**
 * leadProcessor.js
 * Playwright automation: visit site → find contact page → detect & fill form → submit
 */

import { chromium } from 'playwright';
import { detectFormFields } from './formDetector.js';
import { buildFieldValues } from './fieldMapper.js';

// Common contact page URL patterns to try
const CONTACT_SLUGS = [
  '/contact',
  '/contact-us',
  '/contact_us',
  '/contactus',
  '/get-in-touch',
  '/reach-us',
  '/reach-out',
  '/enquiry',
  '/inquiry',
  '/enquire',
  '/hello',
  '/talk-to-us',
  '/hire-us',
  '/work-with-us',
];

const NAV_LINK_PATTERNS = /contact|get in touch|reach us|enquir|talk to us|hire us|message us|write to us/i;

export async function processLead({
  index, company, url, contact, email, phone,
  senderDetails, messageTemplate, emitter,
}) {
  const start = Date.now();
  const log = (type, msg) => emitter.emit('log', { type, message: `  ↳ ${msg}`, index });

  const result = {
    index,
    company,
    url: url || '',
    status: 'failed',
    note: '',
    fieldsFound: [],
    fieldsFilledCount: 0,
    duration: 0,
    timestamp: new Date().toISOString(),
  };

  if (!url || !url.trim()) {
    result.note = 'No website URL provided';
    result.status = 'failed';
    result.duration = Date.now() - start;
    return result;
  }

  // Normalise URL
  let baseUrl = url.trim();
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = 'https://' + baseUrl;
  baseUrl = baseUrl.replace(/\/$/, '');
  result.url = baseUrl;

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });

    // Block heavy assets to speed things up
    await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4,mp3}', r => r.abort());

    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    // ── Step 1: Load homepage ────────────────────────────────
    log('info', `Loading ${baseUrl}`);
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
      result.note = `Could not reach website: ${e.message.slice(0, 80)}`;
      result.status = 'failed';
      result.duration = Date.now() - start;
      await browser.close();
      return result;
    }

    // ── Step 2: Find contact page ─────────────────────────────
    log('info', 'Searching for contact page…');
    let contactUrl = await findContactPage(page, baseUrl);

    if (!contactUrl) {
      result.note = 'Could not find a contact page';
      result.status = 'noform';
      result.duration = Date.now() - start;
      await browser.close();
      return result;
    }

    // Navigate if we're not already there
    if (page.url() !== contactUrl) {
      log('info', `Navigating to contact page: ${contactUrl}`);
      try {
        await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500); // let JS render
      } catch (e) {
        result.note = `Contact page failed to load: ${e.message.slice(0, 80)}`;
        result.status = 'noform';
        result.duration = Date.now() - start;
        await browser.close();
        return result;
      }
    }

    // ── Step 3: Detect form fields ────────────────────────────
    log('info', 'Scanning for form fields…');
    const formInfo = await detectFormFields(page);

    if (!formInfo.hasForm) {
      result.note = 'No fillable contact form found on page';
      result.status = 'noform';
      result.duration = Date.now() - start;
      await browser.close();
      return result;
    }

    log('info', `Found form with ${formInfo.fields.length} field(s): ${formInfo.fields.map(f => f.label || f.type).join(', ')}`);
    result.fieldsFound = formInfo.fields.map(f => f.label || f.name || f.type);

    // ── Step 4: Build fill values ─────────────────────────────
    const fillValues = buildFieldValues(formInfo.fields, {
      senderDetails,
      messageTemplate,
      company,       // the lead's company name for {company} substitution
    });

    // ── Step 5: Fill each field ───────────────────────────────
    log('info', 'Filling form fields…');
    let filledCount = 0;

    for (const { field, value } of fillValues) {
      if (!value) continue;
      try {
        const el = page.locator(field.selector).first();
        await el.waitFor({ state: 'visible', timeout: 5000 });

        if (field.type === 'select') {
          await el.selectOption({ label: value }).catch(() => el.selectOption({ index: 1 }));
        } else if (field.type === 'textarea' || field.type === 'text' || field.type === 'email' || field.type === 'tel') {
          await el.click();
          await el.fill('');
          // Human-like typing
          await el.type(value, { delay: 18 + Math.random() * 22 });
        } else {
          await el.fill(value);
        }
        filledCount++;
        log('info', `  Filled "${field.label || field.name}" with ${value.length > 40 ? value.slice(0, 40) + '…' : value}`);
        await page.waitForTimeout(150 + Math.random() * 200);
      } catch (e) {
        log('warn', `  Could not fill "${field.label || field.name}": ${e.message.slice(0, 60)}`);
      }
    }

    result.fieldsFilledCount = filledCount;

    if (filledCount === 0) {
      result.note = 'Form detected but no fields could be filled';
      result.status = 'failed';
      result.duration = Date.now() - start;
      await browser.close();
      return result;
    }

    // ── Step 6: Submit form ───────────────────────────────────
    log('info', 'Submitting form…');
    const submitted = await submitForm(page, formInfo);

    if (submitted) {
      result.status = 'success';
      result.note   = `${filledCount} field(s) filled & form submitted`;
      log('success', `✓ Form submitted successfully for ${company}`);
    } else {
      result.status = 'failed';
      result.note   = `Filled ${filledCount} fields but could not confirm submission`;
    }

    await browser.close();
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    result.status = 'failed';
    result.note   = `Unexpected error: ${err.message.slice(0, 100)}`;
    log('error', `Error on ${company}: ${err.message.slice(0, 100)}`);
  }

  result.duration = Date.now() - start;
  return result;
}

// ── Helpers ──────────────────────────────────────────────────

async function findContactPage(page, baseUrl) {
  // 1. Look for a nav link matching contact patterns
  const links = await page.$$eval('a[href]', els =>
    els.map(el => ({ href: el.href, text: el.innerText.trim() }))
  );

  const contactLink = links.find(l => NAV_LINK_PATTERNS.test(l.text));
  if (contactLink?.href) return contactLink.href;

  // 2. Try well-known slug patterns
  for (const slug of CONTACT_SLUGS) {
    const candidate = baseUrl + slug;
    try {
      const resp = await page.request.get(candidate, { timeout: 8000 });
      if (resp.ok()) return candidate;
    } catch { /* skip */ }
  }

  // 3. Check if there's a form on the current page itself
  const hasFormHere = await page.$('form');
  if (hasFormHere) return page.url();

  return null;
}

async function submitForm(page, formInfo) {
  // Strategy 1: Click the submit button
  if (formInfo.submitSelector) {
    try {
      await page.waitForTimeout(300 + Math.random() * 300);
      await page.locator(formInfo.submitSelector).first().click();
      // Wait for navigation or success indicator
      await Promise.race([
        page.waitForNavigation({ timeout: 8000 }),
        page.waitForSelector(
          '[class*="success"],[class*="thank"],[id*="success"],[id*="thank"],h1,h2',
          { timeout: 8000 }
        ),
      ]).catch(() => {});
      return true;
    } catch { /* fall through */ }
  }

  // Strategy 2: Press Enter on the last filled field
  try {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    return true;
  } catch { return false; }
}
