/**
 * VeriJob Auto-Apply Agent v2 — Rigorous Backend
 * Features:
 *  - Persistent browser sessions (login once per platform, cookies saved)
 *  - SSE real-time log streaming per job
 *  - In-memory job queue with status tracking
 *  - Full LinkedIn Easy Apply (all question types)
 *  - Naukri & Indeed apply flows
 *  - Cover letter generation via OpenAI
 *  - Screenshot on every failure for debugging
 *  - Human-like random delays to avoid bot detection
 *  - Retry logic (3 attempts per job)
 */

const express  = require("express");
const cors     = require("cors");
const fs       = require("fs");
const path     = require("path");
const { chromium } = require("playwright");
const OpenAI   = require("openai").default;
const Database = require("better-sqlite3");
const { scrapeAll } = require("./scraper");

const app = express();
// Allow requests from any origin — needed when frontend is on Vercel and
// backend is exposed via Cloudflare Tunnel or any other public URL
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" })); // larger limit for base64 CV uploads

// ── Paths ──────────────────────────────────────────────────────────────────
const ROOT         = __dirname;
const LOG_FILE     = path.join(ROOT, "applications.json");
const SESSIONS_DIR = path.join(ROOT, "sessions");
const SS_DIR       = path.join(ROOT, "screenshots");
[SESSIONS_DIR, SS_DIR].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }));

// ── Candidate CV ───────────────────────────────────────────────────────────
const CV = {
  name:           "Gautam Kumar",
  firstName:      "Gautam",
  lastName:       "Kumar",
  email:          "gkt2work@gmail.com",
  phone:          "9934455873",
  phoneE164:      "+919934455873",
  location:       "Bangalore, Karnataka, India",
  city:           "Bangalore",
  pincode:        "560001",
  currentTitle:   "Verification Engineer",
  currentCompany: "Chipsil Technologies",
  totalExpYears:  "1",
  noticePeriod:   "30 days",
  currentCTC:     "5",       // LPA
  expectedCTC:    "10",      // LPA
  linkedin:       "https://www.linkedin.com/in/gautam-kumar-verifiy",
  github:         "https://github.com/gk2work",
  cvPath:         path.join(ROOT, "../Gautam_Kumar.pdf"),
  skills: ["SystemVerilog","UVM","Formal Verification","SVA","Verilog","VHDL",
           "Python","TCL","Cadence Xcelium","Cadence Jasper","vManager",
           "GenAI","LLM","Agentic-AI","RAG","MCP","Linux","Git","Jira"],
  answers: {
    // Common pre-screening answers
    authorized:        "Yes",
    sponsorship:       "No",
    relocate:          "Yes",
    remote:            "Yes",
    workMode:          "Hybrid",
    gender:            "Male",
    veteran:           "No",
    disability:        "No",
    degree:            "Bachelor's Degree",
    gpa:               "7.5",
    languages:         "English, Hindi",
    availability:      "Immediately",
    coverLetterWanted: true,
  },
};

// ── SQLite (queue persistence + profile) ──────────────────────────────────
const db = new Database(path.join(ROOT, "verijob.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS queue_jobs (
    id TEXT PRIMARY KEY, job TEXT, status TEXT DEFAULT 'queued',
    apiKey TEXT, createdAt TEXT, finishedAt TEXT, message TEXT
  );
  CREATE TABLE IF NOT EXISTS profile (
    key TEXT PRIMARY KEY, value TEXT
  );
`);
const dbSetStatus = db.prepare(`UPDATE queue_jobs SET status=?, finishedAt=?, message=? WHERE id=?`);
const dbInsertJob = db.prepare(`INSERT OR IGNORE INTO queue_jobs VALUES (?,?,?,?,?,?,?)`);

// ── Application Log ────────────────────────────────────────────────────────
let appLog = [];
try { appLog = JSON.parse(fs.readFileSync(LOG_FILE, "utf8")); } catch {}
const saveLog = () => fs.writeFileSync(LOG_FILE, JSON.stringify(appLog, null, 2));

// ── Rate limiting ──────────────────────────────────────────────────────────
let runningCount = 0;
const MAX_CONCURRENT = 2;
const waitingApplyQueue = [];

async function runLimited(id, apiKey, overrideCV, coverLetter) {
  if (runningCount < MAX_CONCURRENT) {
    runningCount++;
    try { await doApply(id, apiKey, overrideCV, coverLetter); }
    finally {
      runningCount--;
      if (waitingApplyQueue.length) {
        const next = waitingApplyQueue.shift();
        runLimited(next.id, next.apiKey, next.overrideCV, next.coverLetter).catch(() => {});
      }
    }
  } else {
    pushLog(id, `Waiting for slot (${runningCount}/${MAX_CONCURRENT} active)`, "info");
    await new Promise(resolve => waitingApplyQueue.push({ id, apiKey, overrideCV, coverLetter, resolve }));
  }
}

// ── In-memory job queue ────────────────────────────────────────────────────
const queue = new Map();

function createQueueEntry(job, apiKey = "") {
  const id = Date.now() + "-" + Math.random().toString(36).slice(2, 6);
  queue.set(id, { id, job, status: "queued", logs: [], coverLetter: "", sseClients: [] });
  dbInsertJob.run(id, JSON.stringify(job), "queued", apiKey, new Date().toISOString(), null, null);
  return id;
}

function pushLog(id, msg, level = "info") {
  const entry = queue.get(id);
  if (!entry) return;
  const line = { msg, level, ts: new Date().toISOString() };
  entry.logs.push(line);
  entry.sseClients.forEach(res => {
    try { res.write(`data: ${JSON.stringify(line)}\n\n`); } catch {}
  });
}

function setStatus(id, status, message = "") {
  const entry = queue.get(id);
  if (!entry) return;
  entry.status  = status;
  entry.message = message;
  const terminal = ["applied","partial","manual","error","login_required","opened"];
  if (terminal.includes(status)) {
    entry.finishedAt = new Date().toISOString();
    dbSetStatus.run(status, entry.finishedAt, message, id);
  }
  pushLog(id, message || status, status === "error" ? "error" : status === "applied" ? "ok" : "info");
}

// ── Browser & Context pool ─────────────────────────────────────────────────
let _browser = null;
const _contexts = {}; // platform -> BrowserContext

async function getBrowser() {
  if (_browser?.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    slowMo: 60,
  });
  return _browser;
}

async function getCtx(platform) {
  if (_contexts[platform]?.browser?.isConnected?.() ?? true) {
    // try reuse
    if (_contexts[platform]) return _contexts[platform];
  }
  const b      = await getBrowser();
  const sessFile = path.join(SESSIONS_DIR, platform + ".json");
  const ctx    = await b.newContext({
    storageState:    fs.existsSync(sessFile) ? sessFile : undefined,
    userAgent:       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport:        { width: 1280, height: 900 },
    locale:          "en-IN",
    timezoneId:      "Asia/Kolkata",
  });
  // Stealth: mask webdriver flag
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  _contexts[platform] = ctx;
  return ctx;
}

async function saveCtx(platform) {
  const ctx = _contexts[platform];
  if (!ctx) return;
  try { await ctx.storageState({ path: path.join(SESSIONS_DIR, platform + ".json") }); } catch {}
}

// ── Human-like helpers ─────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = (base, range = 400) => sleep(base + Math.random() * range);

async function humanType(el, text) {
  await el.click({ clickCount: 3 });
  for (const ch of text) {
    await el.type(ch, { delay: 40 + Math.random() * 60 });
  }
}

async function screenshot(page, label) {
  try {
    const f = path.join(SS_DIR, label + "_" + Date.now() + ".png");
    await page.screenshot({ path: f, fullPage: true });
    return f;
  } catch { return null; }
}

// ── Cover Letter ───────────────────────────────────────────────────────────
async function genCoverLetter(job, apiKey) {
  if (!apiKey) return fallbackCL(job);
  try {
    const oai  = new OpenAI({ apiKey });
    const resp = await oai.chat.completions.create({
      model:      "gpt-4o-mini",
      max_tokens: 450,
      messages: [{
        role: "user",
        content: `Write a 3-paragraph professional cover letter (max 180 words) for:
Job: ${job.title} at ${job.company}
Platform: ${job.source || "Unknown"}

Candidate — Gautam Kumar:
• Current: Verification Engineer at Chipsil Technologies (Mar 2025–present)
• Skills: SystemVerilog UVM, Formal Verification (SVA/Jasper), Cadence Xcelium/Jasper/vManager, Python, TCL
• Also: GenAI, RAG, Agentic-AI, MCP
• Education: Executive M.Tech VLSI Design (PES Univ), B.Tech ECE

Be specific to the role. First person. No salutation/sign-off. Just 3 tight paragraphs.`,
      }],
    });
    return resp.choices[0]?.message?.content?.trim() || fallbackCL(job);
  } catch { return fallbackCL(job); }
}

function fallbackCL(job) {
  return `I am writing to express my strong interest in the ${job.title} position at ${job.company}. With hands-on experience in SystemVerilog UVM, Formal Verification using SVA and Jasper, and IP-level functional verification at Chipsil Technologies, I can contribute immediately.

My background includes ASIC/IP verification of FIFO, FSM, and AHB protocol modules, coverage closure, regression automation, and formal property verification. I also bring GenAI and Agentic-AI experience from my internship, which complements modern verification automation workflows.

I would welcome the opportunity to discuss how my skills align with ${job.company}'s verification requirements and contribute to your team's success.`;
}

// ── Dynamic form scanner (#2) ─────────────────────────────────────────────
// Resolves label text for every visible input/select/textarea using 4 strategies
const FIELD_MAP = [
  { kw:["first name","firstname","given name"],    cvKey:"firstName"      },
  { kw:["last name","lastname","surname","family"], cvKey:"lastName"       },
  { kw:["full name","your name","candidate name"],  cvKey:"name"           },
  { kw:["email","e-mail"],                          cvKey:"email"          },
  { kw:["phone","mobile","contact no","cell"],      cvKey:"phone"          },
  { kw:["city","location","current loc"],           cvKey:"city"           },
  { kw:["years of exp","total exp","experience in year","yrs of exp"], cvKey:"totalExpYears" },
  { kw:["current ctc","current salary","current package"], cvKey:"currentCTC" },
  { kw:["expected ctc","expected salary","expected package","expected"], cvKey:"expectedCTC" },
  { kw:["notice period","notice"],                  cvKey:"noticePeriod"   },
  { kw:["linkedin"],                                cvKey:"linkedin"       },
  { kw:["github","portfolio","website"],            cvKey:"github"         },
  { kw:["pincode","zip","postal"],                  cvKey:"pincode"        },
];

async function fillFormDynamic(page, cv, logFn) {
  const filled = [];
  const inputs = await page.$$("input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]), textarea").catch(() => []);

  for (const inp of inputs) {
    try {
      const isVisible = await inp.isVisible().catch(() => false);
      if (!isVisible) continue;

      const cur = await inp.inputValue().catch(() => "");
      if (cur.trim()) continue; // already has value

      // Resolve label text using 4 strategies
      const id          = (await inp.getAttribute("id") || "").toLowerCase();
      const ariaLabel   = (await inp.getAttribute("aria-label") || "").toLowerCase();
      const placeholder = (await inp.getAttribute("placeholder") || "").toLowerCase();
      const ariaLLBy    = await inp.getAttribute("aria-labelledby");
      let labelText     = ariaLabel || placeholder;

      if (!labelText && ariaLLBy) {
        const lblEl = await page.$(`#${ariaLLBy}`).catch(() => null);
        if (lblEl) labelText = (await lblEl.textContent() || "").toLowerCase();
      }
      if (!labelText && id) {
        const lblEl = await page.$(`label[for="${id}"]`).catch(() => null);
        if (lblEl) labelText = (await lblEl.textContent() || "").toLowerCase();
      }
      if (!labelText) {
        // Nearest ancestor <label>
        labelText = (await inp.evaluate(el => el.closest("label")?.textContent || "") || "").toLowerCase();
      }

      const combined = `${id} ${labelText}`;
      const matched  = FIELD_MAP.find(f => f.kw.some(k => combined.includes(k)));
      if (matched && cv[matched.cvKey]) {
        await humanType(inp, String(cv[matched.cvKey]));
        filled.push(`${matched.cvKey}="${cv[matched.cvKey]}"`);
      }
    } catch {}
  }

  if (filled.length) logFn(`Dynamic fill: ${filled.join(", ")}`, "info");
}

// ── Answer screening questions (radios / selects) ─────────────────────────
async function answerScreeningQuestions(page, logFn) {
  const answered = [];

  const radios = await page.$$("input[type='radio'], input[type='checkbox']").catch(() => []);
  for (const radio of radios) {
    try {
      const name = (await radio.getAttribute("name") || "").toLowerCase();
      const val  = (await radio.getAttribute("value") || "").toLowerCase();
      if ((name.includes("authorized")||name.includes("eligible")||name.includes("legal")) && val==="yes") { await radio.check(); answered.push("authorized=yes"); }
      if (name.includes("sponsor") && val==="no")  { await radio.check(); answered.push("sponsor=no"); }
      if (name.includes("relocat") && val==="yes") { await radio.check(); answered.push("relocate=yes"); }
      if ((name.includes("veteran")||name.includes("disab")) && (val==="no"||val.includes("prefer"))) { await radio.check(); answered.push(`${name}=no`); }
    } catch {}
  }

  const selects = await page.$$("select").catch(() => []);
  for (const sel of selects) {
    try {
      const id   = (await sel.getAttribute("id")   || "").toLowerCase();
      const name = (await sel.getAttribute("name") || "").toLowerCase();
      const opts = await sel.$$eval("option", os => os.map(o => ({ v:o.value, t:o.textContent.toLowerCase() })));
      if (name.includes("exp")||id.includes("exp")) {
        const m = opts.find(o=>o.t.includes("1")||o.t.includes("0-2")||o.t.includes("fresher"));
        if (m) { await sel.selectOption(m.v); answered.push(`exp=${m.v}`); }
      } else if (name.includes("notice")||id.includes("notice")) {
        const m = opts.find(o=>o.t.includes("30")||o.t.includes("1 month")||o.t.includes("immediate"));
        if (m) { await sel.selectOption(m.v); answered.push(`notice=${m.v}`); }
      } else if (name.includes("gender")||id.includes("gender")) {
        const m = opts.find(o=>o.t.includes("male")&&!o.t.includes("female"));
        if (m) { await sel.selectOption(m.v); answered.push("gender=male"); }
      }
    } catch {}
  }
  if (answered.length) logFn(`Answered ${answered.length} screening Qs`, "info");
}

// ── LinkedIn Easy Apply ────────────────────────────────────────────────────
async function applyLinkedIn(page, job, coverLetter, jobId, cv = CV) {
  const log = (m, l) => pushLog(jobId, m, l);

  await jitter(1500);

  // Detect login wall
  const isLoggedIn = await page.$(".global-nav__me, .feed-identity-module, #ember").catch(() => null);
  const loginWall  = await page.$('.login__form, [data-test-id="login-form"]').catch(() => null);
  if (!isLoggedIn || loginWall) {
    log("Not logged in to LinkedIn. Opening login page...", "warn");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    log("Please log in to LinkedIn in the browser. Waiting up to 60 seconds...", "warn");
    await page.waitForSelector(".global-nav__me, .feed-identity-module", { timeout: 60000 }).catch(() => {});
    await saveCtx("linkedin");
    log("LinkedIn login detected. Continuing...", "ok");
    await page.goto(job.url, { waitUntil: "domcontentloaded" });
    await jitter(2000);
  }

  // Find Easy Apply button
  log("Looking for Easy Apply button...", "info");
  const easyApplyBtn = await page.waitForSelector(
    "button.jobs-apply-button, button[aria-label*='Easy Apply'], .jobs-apply-button--top-card",
    { timeout: 8000 }
  ).catch(() => null);

  if (!easyApplyBtn) {
    const externalBtn = await page.$("button[aria-label*='Apply'], a[href*='/apply']").catch(() => null);
    if (externalBtn) {
      await externalBtn.click();
      log("External apply page opened. Please complete manually.", "warn");
      return "manual";
    }
    await screenshot(page, "linkedin_no_apply_btn");
    log("Easy Apply button not found. Screenshot saved.", "warn");
    return "manual";
  }

  await easyApplyBtn.click();
  await jitter(2000);
  log("Easy Apply modal opened", "info");

  // Walk up to 8 steps in the modal
  for (let step = 0; step < 8; step++) {
    log(`Step ${step + 1}...`, "info");
    await jitter(1000, 600);

    // Upload resume — use override cv path if provided
    const fileInput = await page.$("input[type='file']").catch(() => null);
    if (fileInput && fs.existsSync(cv.cvPath)) {
      await fileInput.setInputFiles(cv.cvPath);
      log("Resume uploaded", "ok");
      await jitter(1000);
    }

    // Dynamic form fill (covers all visible text/email/tel/number inputs)
    await fillFormDynamic(page, cv, log);

    // Textareas (cover letter / additional info)
    const textareas = await page.$$("textarea").catch(() => []);
    for (const ta of textareas) {
      try {
        const cur = await ta.inputValue().catch(() => "");
        if (!cur.trim()) { await humanType(ta, coverLetter); log("Filled cover letter", "info"); }
      } catch {}
    }

    // Answer screening questions
    await answerScreeningQuestions(page, log);

    // Check for "Submit application" button
    const submitBtn = await page.$("button[aria-label='Submit application'], button[aria-label*='Submit']").catch(() => null);
    if (submitBtn) {
      const isVisible = await submitBtn.isVisible().catch(() => false);
      if (isVisible) {
        await submitBtn.click();
        await jitter(2000);
        log("Application submitted on LinkedIn!", "ok");
        await saveCtx("linkedin");
        return "applied";
      }
    }

    // "Next" / "Review" / "Continue" button
    const nextBtn =
      await page.$("button[aria-label='Continue to next step']").catch(() => null) ||
      await page.$("button[aria-label='Review your application']").catch(() => null) ||
      await page.$("button[aria-label='Continue to next step'].artdeco-button--primary").catch(() => null);
    if (nextBtn) {
      const visible = await nextBtn.isVisible().catch(() => false);
      if (visible) { await nextBtn.click(); await jitter(1200); continue; }
    }

    // "Dismiss" safety modal
    const dismissBtn = await page.$("button[aria-label='Dismiss']").catch(() => null);
    if (dismissBtn) { await dismissBtn.click(); await jitter(800); }

    break;
  }

  log("Form filled — please review and submit in the browser", "warn");
  return "partial";
}

// ── Naukri Apply ───────────────────────────────────────────────────────────
async function applyNaukri(page, job, coverLetter, jobId, cv = CV) {
  const log = (m, l) => pushLog(jobId, m, l);
  await jitter(2000);

  const loggedIn = await page.$(".nI-gNb-drawer__bars, .naukri-logo, .user-name").catch(() => null);
  const loginBtn = await page.$('a[href*="login"]').catch(() => null);
  if (!loggedIn || loginBtn) {
    log("Not logged in to Naukri. Opening login...", "warn");
    await page.goto("https://www.naukri.com/nlogin/login", { waitUntil: "domcontentloaded" });
    log("Please log in to Naukri. Waiting up to 60 seconds...", "warn");
    await page.waitForSelector(".nI-gNb-drawer__bars, .user-name", { timeout: 60000 }).catch(() => {});
    await saveCtx("naukri");
    log("Naukri login detected. Continuing...", "ok");
    await page.goto(job.url, { waitUntil: "domcontentloaded" });
    await jitter(2000);
  }

  const applyBtn =
    await page.$("button#apply-button").catch(() => null) ||
    await page.$(".apply-button").catch(() => null) ||
    await page.$("button.btn-dark-mm").catch(() => null) ||
    await page.$("a[href*='applyJob']").catch(() => null);

  if (!applyBtn) { log("Apply button not found on Naukri", "warn"); await screenshot(page, "naukri_no_apply"); return "manual"; }

  await applyBtn.click();
  await jitter(2000);

  const chatClose = await page.$(".chatbot_close, .modal-close").catch(() => null);
  if (chatClose) { await chatClose.click(); await jitter(500); }

  const fileInput = await page.$("input[type='file']").catch(() => null);
  if (fileInput && fs.existsSync(cv.cvPath)) { await fileInput.setInputFiles(cv.cvPath); log("Resume uploaded on Naukri", "ok"); await jitter(1000); }

  await fillFormDynamic(page, cv, log);

  const clArea = await page.$("textarea").catch(() => null);
  if (clArea) { await humanType(clArea, coverLetter); log("Cover letter filled", "info"); }

  await answerScreeningQuestions(page, log);

  const submitBtn = await page.$("button[type='submit'], button.btn-primary").catch(() => null);
  if (submitBtn && await submitBtn.isVisible().catch(() => false)) {
    await submitBtn.click(); await jitter(2000);
    log("Application submitted on Naukri!", "ok"); await saveCtx("naukri"); return "applied";
  }

  log("Form opened on Naukri — please review and submit", "warn");
  return "partial";
}

// ── Indeed Apply ───────────────────────────────────────────────────────────
async function applyIndeed(page, job, coverLetter, jobId, cv = CV) {
  const log = (m, l) => pushLog(jobId, m, l);
  await jitter(2000);

  const applyBtn =
    await page.$("#indeedApplyButton, .jobsearch-IndeedApplyButton-newDesign").catch(() => null) ||
    await page.$("button[aria-label*='Apply'], a[data-tn-element*='apply']").catch(() => null);

  if (!applyBtn) { log("Apply button not found on Indeed", "warn"); return "manual"; }
  await applyBtn.click();
  await jitter(2500);

  const pages = page.context().pages();
  const applyPage = pages[pages.length - 1];

  for (let step = 0; step < 6; step++) {
    await jitter(1000);
    await fillFormDynamic(applyPage, cv, log);

    const fileInput = await applyPage.$("input[type='file']").catch(() => null);
    if (fileInput && fs.existsSync(cv.cvPath)) { await fileInput.setInputFiles(cv.cvPath); log("Resume uploaded on Indeed", "ok"); }

    const nextBtn = await applyPage.$("button[type='submit'], button[data-tn-element='continueButton']").catch(() => null);
    if (nextBtn) { await nextBtn.click(); await jitter(1000); }
    else break;
  }

  log("Indeed application filled — please review and submit", "warn");
  return "partial";
}

// ── Glassdoor Apply ────────────────────────────────────────────────────────
async function applyGlassdoor(page, job, coverLetter, jobId, cv = CV) {
  const log = (m, l) => pushLog(jobId, m, l);
  await jitter(2000);
  const easyApply = await page.$("button[aria-label*='Easy Apply'], .EasyApply").catch(() => null);
  if (easyApply) {
    await easyApply.click();
    log("Glassdoor Easy Apply → LinkedIn flow", "info");
    return await applyLinkedIn(page, job, coverLetter, jobId, cv);
  }
  const applyBtn = await page.$("button.applyButton, a.applyButton, [data-test='apply-btn']").catch(() => null);
  if (applyBtn) { await applyBtn.click(); log("Apply clicked on Glassdoor", "info"); return "partial"; }
  log("Could not find apply button on Glassdoor", "warn");
  return "manual";
}

// ── Main apply dispatcher ──────────────────────────────────────────────────
async function doApply(id, apiKey, overrideCV = null, prebuiltCoverLetter = null) {
  const entry = queue.get(id);
  if (!entry) return;
  const { job } = entry;
  const log = (m, l) => pushLog(id, m, l);
  const cv = overrideCV ? { ...CV, ...overrideCV } : CV;

  // Handle temp CV file (base64 PDF from frontend)
  if (overrideCV?.cvBase64 && !cv.cvPath) {
    const tmpPath = path.join(ROOT, `tmp_cv_${id}.pdf`);
    const b64 = overrideCV.cvBase64.replace(/^data:[^;]+;base64,/, "");
    fs.writeFileSync(tmpPath, Buffer.from(b64, "base64"));
    cv.cvPath = tmpPath;
    entry._tmpCvPath = tmpPath;
  }

  setStatus(id, "running");
  log(`Starting apply: "${job.title}" @ ${job.company}`, "info");
  log(`URL: ${job.url}`, "info");
  log(`Platform: ${job.source}`, "info");

  log("Generating tailored cover letter...", "info");
  const cl = prebuiltCoverLetter || await genCoverLetter(job, apiKey);
  entry.coverLetter = cl;
  log("Cover letter ready", "ok");

  const platform = (job.source || "").toLowerCase().replace(/\s/g, "");
  let ctx, page;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      log(`Attempt ${attempt}/3 — launching browser`, "info");
      ctx  = await getCtx(platform || "generic");
      page = await ctx.newPage();

      // Navigate to job URL
      log("Navigating to job URL...", "info");
      await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await jitter(1500, 800);

      let status;
      if (platform.includes("linkedin")) status = await applyLinkedIn(page, job, cl, id);
      else if (platform.includes("naukri")) status = await applyNaukri(page, job, cl, id);
      else if (platform.includes("indeed")) status = await applyIndeed(page, job, cl, id);
      else if (platform.includes("glassdoor")) status = await applyGlassdoor(page, job, cl, id);
      else {
        log("Unknown platform — page opened in browser. Apply manually.", "warn");
        status = "opened";
      }

      // Persist to application log
      const record = {
        id: Date.now(), queueId: id,
        title: job.title, company: job.company, location: job.location,
        source: job.source, salary: job.salary || null, exp: job.exp || null,
        url: job.url, keyword: job.keyword || "",
        appliedAt: new Date().toISOString(),
        status, message: entry.message || "", coverLetter: cl,
      };
      appLog.push(record);
      saveLog();

      setStatus(id, status, status === "applied" ? "Application submitted!" : "Browser open — action required");
      entry.record = record;

      if (status !== "applied") {
        // Keep browser open for user to complete
        log("Browser left open for manual completion", "info");
      } else {
        try { await page.close(); } catch {}
      }
      return;

    } catch (err) {
      log(`Attempt ${attempt} failed: ${err.message}`, "warn");
      try { await screenshot(page, `error_${platform}_attempt${attempt}`); } catch {}
      try { await page?.close(); } catch {}
      if (attempt < 3) { await sleep(2000 + attempt * 1000); continue; }
      setStatus(id, "error", err.message);
      const record = {
        id: Date.now(), queueId: id,
        title: job.title, company: job.company, location: job.location,
        source: job.source, url: job.url, keyword: job.keyword || "",
        appliedAt: new Date().toISOString(),
        status: "error", message: err.message, coverLetter: cl,
      };
      appLog.push(record);
      saveLog();
    }
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

// ── calcMatch / extractTags mirrors (needed to enrich scraped jobs) ─────────
function calcMatchServer(title, company) {
  let s = 45;
  const t = (title + " " + company).toLowerCase();
  if (t.includes("verification")) s += 15;
  if (t.includes("uvm"))          s += 12;
  if (t.includes("systemverilog") || t.includes("sv")) s += 10;
  if (t.includes("asic") || t.includes("soc") || t.includes("rtl")) s += 8;
  if (t.includes("formal"))       s += 8;
  if (t.includes("sva") || t.includes("jasper")) s += 5;
  if (t.includes("bangalore") || t.includes("india")) s += 5;
  return Math.min(s, 98);
}

function extractTagsServer(text) {
  const t = text.toLowerCase();
  const tags = [];
  if (t.includes("uvm"))           tags.push("UVM");
  if (t.includes("systemverilog") || t.includes("sv-uvm")) tags.push("SystemVerilog");
  if (t.includes("formal"))        tags.push("Formal");
  if (t.includes("sva"))           tags.push("SVA");
  if (t.includes("asic"))          tags.push("ASIC");
  if (t.includes("soc"))           tags.push("SoC");
  if (t.includes("rtl"))           tags.push("RTL");
  if (t.includes("python"))        tags.push("Python");
  if (tags.length === 0)           tags.push("Verification");
  return tags.slice(0, 4);
}

// POST /api/scrape — real job scraping via Playwright
app.post("/api/scrape", async (req, res) => {
  const { keyword, pagesPerPlatform = 4, expMin, expMax } = req.body;
  if (!keyword) return res.status(400).json({ error: "Missing keyword" });

  const expFilter = (expMin != null && expMax != null) ? [expMin, expMax] : null;
  const logs = [];
  const logFn = (msg, level = "info") => {
    logs.push({ msg, level, ts: new Date().toISOString() });
    console.log(`[scrape] ${msg}`);
  };

  try {
    // Build context map — reuse existing persistent contexts
    const ctxMap = {
      naukri:    await getCtx("naukri"),
      linkedin:  await getCtx("linkedin"),
      indeed:    await getCtx("indeed"),
      glassdoor: await getCtx("glassdoor"),
    };

    logFn(`Scraping "${keyword}" | ${pagesPerPlatform} pages/platform | exp: ${expFilter || "any"}`);
    const raw = await scrapeAll(ctxMap, keyword, pagesPerPlatform, expFilter, logFn);

    // Enrich with match score, tags, sourceType
    const seen = new Set();
    const jobs = raw
      .filter(j => {
        const key = (j.title + j.company).toLowerCase().replace(/\s/g, "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(j => ({
        ...j,
        location: j.location || "Bangalore, India",
        posted:   j.posted   || "Recent",
        match:      calcMatchServer(j.title, j.company),
        tags:       extractTagsServer(j.title + " " + (j.company || "")),
        keyword,
        sourceType: "real",   // ← marks as scraped, not AI-generated
      }))
      .sort((a, b) => b.match - a.match);

    logFn(`Scrape done: ${jobs.length} unique real jobs`, "ok");
    res.json({ jobs, count: jobs.length, logs });
  } catch (e) {
    logFn(`Scrape failed: ${e.message}`, "warn");
    res.status(500).json({ error: e.message, jobs: [], logs });
  }
});

// POST /api/apply — queue one job, returns id
app.post("/api/apply", async (req, res) => {
  const { job, apiKey, overrideCV, coverLetter } = req.body;
  if (!job?.url) return res.status(400).json({ error: "Missing job.url" });

  const already = appLog.find(a => a.url === job.url && a.status === "applied");
  if (already) return res.json({ status: "already_applied", message: "Already applied", appliedAt: already.appliedAt });

  const id = createQueueEntry(job, apiKey);
  res.json({ id, status: "queued" });

  // Rate-limited async dispatch
  runLimited(id, apiKey, overrideCV || null, coverLetter || null)
    .catch(err => setStatus(id, "error", err.message));
});

// POST /api/apply-all — queue multiple jobs
app.post("/api/apply-all", async (req, res) => {
  const { jobs, apiKey, overrideCV, minMatch = 0 } = req.body;
  if (!Array.isArray(jobs) || !jobs.length) return res.status(400).json({ error: "No jobs provided" });

  // Skip already-applied and below minMatch threshold
  const filtered = jobs.filter(j => {
    if ((j.match || 0) < minMatch) return false;
    const already = appLog.find(a => a.url === j.url && a.status === "applied");
    return !already;
  });

  const ids = filtered.map(j => createQueueEntry(j, apiKey));
  res.json({ ids, count: ids.length, skipped: jobs.length - filtered.length });

  // Enqueue all via rate limiter (runLimited handles concurrency internally)
  ids.forEach(id =>
    runLimited(id, apiKey, overrideCV || null, null)
      .catch(err => setStatus(id, "error", err.message))
  );
});

// GET /api/job-status/:id — SSE stream of logs for one queued job
app.get("/api/job-status/:id", (req, res) => {
  const entry = queue.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Unknown job id" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send all buffered logs immediately
  entry.logs.forEach(l => res.write(`data: ${JSON.stringify(l)}\n\n`));

  // If already finished, send close
  if (["applied","partial","manual","error","opened"].includes(entry.status)) {
    res.write(`data: ${JSON.stringify({ msg: "__done__", status: entry.status })}\n\n`);
    return res.end();
  }

  // Register as live client
  entry.sseClients.push(res);
  req.on("close", () => {
    entry.sseClients = entry.sseClients.filter(r => r !== res);
  });

  // Also send done when status changes to terminal
  const interval = setInterval(() => {
    if (["applied","partial","manual","error","opened"].includes(entry.status)) {
      res.write(`data: ${JSON.stringify({ msg: "__done__", status: entry.status })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 800);
});

// GET /api/job-status/:id/poll — simple JSON poll (no SSE)
app.get("/api/job-status/:id/poll", (req, res) => {
  const entry = queue.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Not found" });
  res.json({ id: entry.id, status: entry.status, message: entry.message, logs: entry.logs });
});

// GET /api/applications
app.get("/api/applications", (req, res) => {
  res.json(appLog.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt)));
});

// DELETE /api/applications/:id
app.delete("/api/applications/:id", (req, res) => {
  appLog = appLog.filter(a => a.id !== Number(req.params.id));
  saveLog();
  res.json({ ok: true });
});

// DELETE /api/applications
app.delete("/api/applications", (req, res) => {
  appLog = [];
  saveLog();
  res.json({ ok: true });
});

// POST /api/cover-letter
app.post("/api/cover-letter", async (req, res) => {
  const { job, apiKey } = req.body;
  if (!job) return res.status(400).json({ error: "Missing job" });
  res.json({ coverLetter: await genCoverLetter(job, apiKey) });
});

// GET /api/health
app.get("/api/health", (req, res) => res.json({ ok: true, cv: CV.name, logCount: appLog.length, running: runningCount }));

// GET /api/session-status — which platforms have saved session cookies
app.get("/api/session-status", (req, res) => {
  const platforms = ["linkedin", "naukri", "indeed", "glassdoor"];
  const status = {};
  platforms.forEach(p => {
    const f = path.join(SESSIONS_DIR, p + ".json");
    if (fs.existsSync(f)) {
      const st = fs.statSync(f);
      status[p] = { saved: true, size: st.size, mtime: st.mtime };
    } else {
      status[p] = { saved: false };
    }
  });
  res.json(status);
});

// DELETE /api/session/:platform — clear a saved session
app.delete("/api/session/:platform", async (req, res) => {
  const platform = req.params.platform;
  const f = path.join(SESSIONS_DIR, platform + ".json");
  if (fs.existsSync(f)) fs.unlinkSync(f);
  // Close in-memory context so next apply gets a fresh one
  const ctx = _contexts[platform];
  if (ctx) { await ctx.close().catch(() => {}); delete _contexts[platform]; }
  res.json({ ok: true, platform });
});

// GET /api/screenshots — list screenshot files (most recent first, max 50)
app.get("/api/screenshots", (req, res) => {
  try {
    const files = fs.readdirSync(SS_DIR)
      .filter(f => f.endsWith(".png"))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(SS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50)
      .map(f => f.name);
    res.json(files);
  } catch { res.json([]); }
});

// GET /api/screenshots/:file — serve a single screenshot
app.get("/api/screenshots/:file", (req, res) => {
  const f = path.join(SS_DIR, path.basename(req.params.file));
  if (fs.existsSync(f)) res.sendFile(f);
  else res.status(404).json({ error: "Not found" });
});

// GET /api/profile — load saved profile overrides
app.get("/api/profile", (req, res) => {
  try {
    const rows = db.prepare("SELECT key, value FROM profile").all();
    const profile = {};
    rows.forEach(r => {
      try { profile[r.key] = JSON.parse(r.value); } catch { profile[r.key] = r.value; }
    });
    res.json(profile);
  } catch { res.json({}); }
});

// POST /api/profile — save profile overrides
app.post("/api/profile", (req, res) => {
  const upsert = db.prepare("INSERT OR REPLACE INTO profile (key, value) VALUES (?, ?)");
  Object.entries(req.body).forEach(([k, v]) => upsert.run(k, JSON.stringify(v)));
  res.json({ ok: true });
});

// GET /api/queue-status — current queue snapshot
app.get("/api/queue-status", (req, res) => {
  const items = [];
  queue.forEach(entry => {
    items.push({ id: entry.id, status: entry.status, title: entry.job?.title, company: entry.job?.company });
  });
  res.json({ running: runningCount, waiting: waitingApplyQueue.length, items });
});

const PORT = 3001;
app.listen(PORT, () => {
  // Re-enqueue any jobs that were 'running' or 'queued' when server last stopped
  try {
    const stale = db.prepare("SELECT * FROM queue_jobs WHERE status IN ('queued','running')").all();
    if (stale.length) {
      console.log(`[startup] Re-queuing ${stale.length} unfinished jobs from SQLite...`);
      stale.forEach(row => {
        try {
          const job = JSON.parse(row.job);
          queue.set(row.id, { id: row.id, job, status: "queued", logs: [], coverLetter: "", sseClients: [] });
          runLimited(row.id, row.apiKey, null, null).catch(() => {});
        } catch {}
      });
    }
  } catch {}

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   VeriJob Apply Agent v2  →  :${PORT}          ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log(`\n  CV      : ${CV.name}  |  ${CV.email}  |  ${CV.phone}`);
  console.log(`  Resume  : ${CV.cvPath}`);
  console.log(`  Sessions: ${SESSIONS_DIR}`);
  console.log(`  Photos  : ${SS_DIR}`);
  console.log(`\n  Endpoints:`);
  console.log(`    POST   /api/apply            queue one job`);
  console.log(`    POST   /api/apply-all         queue many jobs`);
  console.log(`    GET    /api/job-status/:id    SSE live logs`);
  console.log(`    GET    /api/job-status/:id/poll  JSON poll`);
  console.log(`    GET    /api/applications      history`);
  console.log(`    DELETE /api/applications      clear\n`);
});
