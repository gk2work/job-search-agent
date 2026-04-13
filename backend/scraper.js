/**
 * VeriJob Real Job Scraper
 * Scrapes actual live listings from Naukri, LinkedIn, Indeed, Glassdoor
 * using Playwright with persistent sessions and anti-bot measures.
 */

const sleep  = ms => new Promise(r => setTimeout(r, ms));
const jitter = (base, range = 600) => sleep(base + Math.random() * range);

// ── Page wrapper: always closes page ──────────────────────────────────────
async function withPage(ctx, fn) {
  const page = await ctx.newPage();
  try { return await fn(page); }
  finally { await page.close().catch(() => {}); }
}

// ── Dismiss common overlays (cookie banners, login modals) ─────────────────
async function dismissOverlays(page) {
  const selectors = [
    "button#close",
    "button[aria-label='Close']",
    "button[aria-label='Dismiss']",
    "[data-test='modal-close-btn']",
    "#onetrust-accept-btn-handler",
    ".cookie-consent-btn",
    ".modal-close",
    "button.ns-close",
  ];
  for (const sel of selectors) {
    const el = await page.$(sel).catch(() => null);
    if (el && await el.isVisible().catch(() => false)) {
      await el.click().catch(() => {});
      await sleep(400);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NAUKRI  (best for India, no login needed, richest data)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeNaukri(ctx, keyword, maxPages, expFilter, logFn) {
  const allJobs = [];
  const slug    = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  await withPage(ctx, async (page) => {
    for (let p = 1; p <= maxPages; p++) {
      const expParam = expFilter ? `&experience=${expFilter[0]}` : "";
      const url = `https://www.naukri.com/${slug}-jobs-in-bangalore?pageNo=${p}&sortType=1${expParam}`;

      logFn(`  [Naukri] page ${p}/${maxPages}`, "info");
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await jitter(2200, 800);
        await dismissOverlays(page);

        // Wait for any job card variant
        await page.waitForSelector(
          ".jobTuple, .cust-job-tuple, article.jobTuple, [class*='srp-jobtuple']",
          { timeout: 10000 }
        ).catch(() => {});

        const pageJobs = await page.$$eval(
          ".jobTuple, .cust-job-tuple, article.jobTuple, [class*='srp-jobtuple-wrapper']",
          (cards) => cards.map(c => {
            const titleEl = c.querySelector("a.title, a[class*='title'], h2 a, .title a");
            const expRaw  = c.querySelector(".expwdth, [class*='exp'], .experience span")?.textContent?.trim() || null;
            const salRaw  = c.querySelector(".salary, [class*='salary']")?.textContent?.trim() || null;
            const locRaw  = c.querySelector(".locWdth, .location, [class*='loc'] span")?.textContent?.trim() || "Bangalore, India";
            const dateRaw = c.querySelector(".type, [class*='date'], .freshness, .job-post-day")?.textContent?.trim() || "Recent";
            const skills  = [...c.querySelectorAll(".tags li, .tag-li, [class*='skill'] li, [class*='tag'] li")]
                              .map(t => t.textContent.trim()).filter(Boolean).slice(0, 6);
            return {
              title:    titleEl?.textContent?.trim() || "",
              company:  c.querySelector(".comp-name a, .comp-name, [class*='companyName']")?.textContent?.trim() || "",
              location: locRaw,
              url:      titleEl?.href || "",
              exp:      expRaw,
              salary:   salRaw,
              posted:   dateRaw,
              skills,
              source:   "Naukri",
            };
          }).filter(j => j.title && j.url && j.url.includes("naukri.com"))
        ).catch(() => []);

        logFn(`  [Naukri] p${p}: ${pageJobs.length} jobs`, pageJobs.length > 0 ? "ok" : "warn");
        allJobs.push(...pageJobs);
        if (pageJobs.length < 5) break;
        await jitter(1800, 700);
      } catch (e) {
        logFn(`  [Naukri] p${p} error: ${e.message.slice(0, 80)}`, "warn");
        break;
      }
    }
  });
  return allJobs;
}

// ─────────────────────────────────────────────────────────────────────────────
// LINKEDIN  (public search — no login needed for cards, more with login)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeLinkedIn(ctx, keyword, maxPages, expFilter, logFn) {
  const allJobs = [];

  await withPage(ctx, async (page) => {
    // LinkedIn public job search (guest view) — good results without login
    for (let p = 0; p < maxPages; p++) {
      const start = p * 25;
      const url   = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}&location=Bangalore%2C%20Karnataka%2C%20India&f_TPR=r2592000&sortBy=DD&start=${start}`;

      logFn(`  [LinkedIn] page ${p + 1}/${maxPages}`, "info");
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await jitter(2500, 1000);
        await dismissOverlays(page);

        await page.waitForSelector(
          ".base-card, .jobs-search__results-list, .job-search-card",
          { timeout: 10000 }
        ).catch(() => {});

        // Scroll to load lazy cards
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await sleep(800);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(600);

        const pageJobs = await page.$$eval(".base-card", (cards) =>
          cards.map(c => {
            const titleEl   = c.querySelector(".base-search-card__title");
            const companyEl = c.querySelector(".base-search-card__subtitle");
            const locationEl= c.querySelector(".job-search-card__location");
            const timeEl    = c.querySelector("time");
            const linkEl    = c.querySelector("a.base-card__full-link");
            return {
              title:    titleEl?.textContent?.trim() || "",
              company:  companyEl?.textContent?.trim() || "",
              location: locationEl?.textContent?.trim() || "Bangalore, India",
              url:      linkEl?.href || "",
              posted:   timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim() || "Recent",
              source:   "LinkedIn",
            };
          }).filter(j => j.title && j.url && j.url.includes("linkedin.com/jobs"))
        ).catch(() => []);

        logFn(`  [LinkedIn] p${p + 1}: ${pageJobs.length} jobs`, pageJobs.length > 0 ? "ok" : "warn");
        allJobs.push(...pageJobs);
        if (pageJobs.length < 5) break;
        await jitter(2000, 800);
      } catch (e) {
        logFn(`  [LinkedIn] p${p + 1} error: ${e.message.slice(0, 80)}`, "warn");
        break;
      }
    }
  });
  return allJobs;
}

// ─────────────────────────────────────────────────────────────────────────────
// INDEED  (no login, high volume)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeIndeed(ctx, keyword, maxPages, expFilter, logFn) {
  const allJobs = [];

  await withPage(ctx, async (page) => {
    for (let p = 0; p < maxPages; p++) {
      const start = p * 15;
      const url   = `https://in.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=Bangalore%2C+Karnataka&sort=date&radius=25&start=${start}`;

      logFn(`  [Indeed] page ${p + 1}/${maxPages}`, "info");
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await jitter(2000, 800);
        await dismissOverlays(page);

        await page.waitForSelector(
          ".job_seen_beacon, [data-testid='jobCard'], .tapItem",
          { timeout: 10000 }
        ).catch(() => {});

        const pageJobs = await page.$$eval(
          ".job_seen_beacon, .tapItem",
          (cards) => cards.map(c => {
            const titleLink = c.querySelector(".jobTitle a, h2.jobTitle a");
            const salEl     = c.querySelector(".salary-snippet span, [data-testid='attribute_snippet_testid']");
            const dateEl    = c.querySelector(".date, [data-testid='myJobsStateDate'], .result-link-bar-container span");
            const href      = titleLink?.getAttribute("href") || "";
            return {
              title:    titleLink?.querySelector("span[title]")?.textContent?.trim() || titleLink?.textContent?.trim() || "",
              company:  c.querySelector(".companyName, [data-testid='company-name']")?.textContent?.trim() || "",
              location: c.querySelector(".companyLocation, [data-testid='job-location']")?.textContent?.trim() || "Bangalore, India",
              url:      href.startsWith("http") ? href : "https://in.indeed.com" + href,
              salary:   salEl?.textContent?.trim() || null,
              posted:   dateEl?.textContent?.trim() || "Recent",
              source:   "Indeed",
            };
          }).filter(j => j.title && j.url && j.url.includes("indeed.com"))
        ).catch(() => []);

        logFn(`  [Indeed] p${p + 1}: ${pageJobs.length} jobs`, pageJobs.length > 0 ? "ok" : "warn");
        allJobs.push(...pageJobs);
        if (pageJobs.length < 5) break;
        await jitter(1800, 700);
      } catch (e) {
        logFn(`  [Indeed] p${p + 1} error: ${e.message.slice(0, 80)}`, "warn");
        break;
      }
    }
  });
  return allJobs;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLASSDOOR  (some free listings before login wall)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeGlassdoor(ctx, keyword, maxPages, expFilter, logFn) {
  const allJobs = [];
  const kwSlug  = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  await withPage(ctx, async (page) => {
    for (let p = 1; p <= Math.min(maxPages, 2); p++) {
      const url = `https://www.glassdoor.co.in/Job/bangalore-${kwSlug}-jobs-SRCH_IL.0,9_IC2940587_KO10,${10 + kwSlug.length}.htm?sortBy=date_desc&p=${p}`;

      logFn(`  [Glassdoor] page ${p}/${Math.min(maxPages, 2)}`, "info");
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await jitter(2500, 1000);
        await dismissOverlays(page);

        await page.waitForSelector(
          "[data-test='jobListing'], .react-job-listing, li[class*='JobsList']",
          { timeout: 10000 }
        ).catch(() => {});

        const pageJobs = await page.$$eval(
          "[data-test='jobListing'], li[class*='JobsList_jobListItem']",
          (cards) => cards.map(c => {
            const titleEl   = c.querySelector("[data-test='job-title'], [class*='JobCard_jobTitle'], a[class*='jobTitle']");
            const salEl     = c.querySelector("[data-test='detailSalary'], [class*='salaryEstimate']");
            const dateEl    = c.querySelector("[data-test='job-age'], [class*='listingAge'], [class*='jobAge']");
            const url       = titleEl?.href || titleEl?.closest("a")?.href || "";
            return {
              title:    titleEl?.textContent?.trim() || "",
              company:  c.querySelector("[data-test='employer-name'], [class*='EmployerProfile'], [class*='companyName']")?.textContent?.trim() || "",
              location: c.querySelector("[data-test='emp-location'], [class*='location'], [class*='Location']")?.textContent?.trim() || "Bangalore, India",
              url,
              salary:   salEl?.textContent?.trim() || null,
              posted:   dateEl?.textContent?.trim() || "Recent",
              source:   "Glassdoor",
            };
          }).filter(j => j.title && j.url && j.url.includes("glassdoor"))
        ).catch(() => []);

        logFn(`  [Glassdoor] p${p}: ${pageJobs.length} jobs`, pageJobs.length > 0 ? "ok" : "warn");
        allJobs.push(...pageJobs);
        if (pageJobs.length < 3) break;
        await jitter(2000, 1000);
      } catch (e) {
        logFn(`  [Glassdoor] p${p} error: ${e.message.slice(0, 80)}`, "warn");
        break;
      }
    }
  });
  return allJobs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry: scrape all platforms for one keyword
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeAll(ctxMap, keyword, pagesPerPlatform, expFilter, logFn) {
  const all = [];

  const platforms = [
    { name: "Naukri",    fn: scrapeNaukri,    ctx: ctxMap.naukri    },
    { name: "LinkedIn",  fn: scrapeLinkedIn,  ctx: ctxMap.linkedin  },
    { name: "Indeed",    fn: scrapeIndeed,    ctx: ctxMap.indeed    },
    { name: "Glassdoor", fn: scrapeGlassdoor, ctx: ctxMap.glassdoor },
  ];

  for (const p of platforms) {
    if (!p.ctx) continue;
    try {
      logFn(`Scraping ${p.name}...`, "scan");
      const jobs = await p.fn(p.ctx, keyword, pagesPerPlatform, expFilter, logFn);
      logFn(`${p.name}: ${jobs.length} real jobs found`, jobs.length > 0 ? "ok" : "warn");
      all.push(...jobs);
    } catch (e) {
      logFn(`${p.name} scraper crashed: ${e.message}`, "warn");
    }
  }
  return all;
}

module.exports = { scrapeAll, scrapeNaukri, scrapeLinkedIn, scrapeIndeed, scrapeGlassdoor };
