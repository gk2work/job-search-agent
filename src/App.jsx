import { useState, useEffect, useRef, useCallback } from "react";

const PROFILE = {
  name: "Gautam Kumar",
  title: "Verification Engineer",
  location: "Bangalore, India",
  skills: ["SystemVerilog","UVM","Formal Verification","SVA","Verilog","VHDL","Python","TCL","Cadence Xcelium","Cadence Jasper","Cadence vManager","GenAI","LLM","RAG","MCP","Agentic-AI","Linux","Git","Jira","Bitbucket"],
};

const DEFAULT_KEYWORDS = [
  "Verification Engineer","ASIC Verification Engineer","Design Verification Engineer",
  "SoC Verification Engineer","UVM Verification Engineer","RTL Verification Engineer",
  "Functional Verification Engineer","Formal Verification Engineer",
  "VLSI Verification Engineer","IP Verification Engineer",
  "SystemVerilog UVM Engineer","Chip Verification Engineer",
  "Silicon Verification Engineer","Pre-Silicon Verification","ASIC DV Engineer",
];

const PLATFORMS = [
  { id:"google", name:"Google Jobs", letter:"G", color:"#4285F4",
    buildUrl:(kw)=>`https://www.google.com/search?q=${encodeURIComponent(kw+" jobs in Bangalore")}&udm=8&jbr=sep:0` },
  { id:"linkedin", name:"LinkedIn", letter:"in", color:"#0A66C2",
    buildUrl:(kw)=>`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}&location=Bangalore%2C%20Karnataka%2C%20India&f_TPR=r604800&position=1&pageNum=0` },
  { id:"naukri", name:"Naukri", letter:"N", color:"#4A90D9",
    buildUrl:(kw)=>`https://www.naukri.com/${kw.toLowerCase().replace(/\s+/g,"-")}-jobs-in-bangalore` },
  { id:"indeed", name:"Indeed", letter:"I", color:"#2557a7",
    buildUrl:(kw)=>`https://in.indeed.com/jobs?q=${encodeURIComponent(kw)}&l=Bangalore%2C+Karnataka` },
  { id:"glassdoor", name:"Glassdoor", letter:"GD", color:"#0caa41",
    buildUrl:(kw)=>`https://www.glassdoor.co.in/Job/bangalore-${kw.toLowerCase().replace(/\s+/g,"-")}-jobs-SRCH_IL.0,9_IC2940587.htm` },
];

const TARGET_COMPANIES = [
  { name:"Intel", url:"https://jobs.intel.com/en/search-jobs/verification+engineer/Bangalore", color:"#0071C5", tier:"T1" },
  { name:"Qualcomm", url:"https://careers.qualcomm.com/careers?query=verification%20engineer&location=Bangalore", color:"#3253DC", tier:"T1" },
  { name:"AMD", url:"https://careers.amd.com/careers-home/jobs?keywords=verification%20engineer&location=Bangalore", color:"#ED1C24", tier:"T1" },
  { name:"NVIDIA", url:"https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite?q=verification+engineer", color:"#76B900", tier:"T1" },
  { name:"Samsung Semi", url:"https://www.samsung.com/semiconductor/careers/", color:"#1428A0", tier:"T1" },
  { name:"ARM", url:"https://careers.arm.com/search-jobs/verification%20engineer/Bangalore", color:"#0091BD", tier:"T1" },
  { name:"Synopsys", url:"https://careers.synopsys.com/search?q=verification+engineer&location=Bangalore", color:"#A020F0", tier:"T1" },
  { name:"Cadence", url:"https://cadence.wd1.myworkdayjobs.com/External_Careers?q=verification+engineer", color:"#CC0000", tier:"T1" },
  { name:"MediaTek", url:"https://careers.mediatek.com/eREC/JobSearch?keywords=verification+engineer", color:"#F5A623", tier:"T1" },
  { name:"Broadcom", url:"https://broadcom.wd1.myworkdayjobs.com/External_Career?q=verification+engineer", color:"#CC092F", tier:"T1" },
  { name:"Texas Instruments", url:"https://careers.ti.com/search-jobs/verification%20engineer/Bangalore", color:"#CC0000", tier:"T2" },
  { name:"NXP", url:"https://nxp.wd3.myworkdayjobs.com/careers?q=verification+engineer", color:"#FFC72C", tier:"T2" },
  { name:"Marvell", url:"https://jobs.marvell.com/search/?q=verification+engineer&locationsearch=India", color:"#AC162C", tier:"T2" },
  { name:"Renesas", url:"https://www.renesas.com/en/careers?search=verification+engineer", color:"#003DA5", tier:"T2" },
  { name:"Microchip", url:"https://careers.microchip.com/search/?q=verification+engineer&locationsearch=India", color:"#EE3124", tier:"T2" },
  { name:"Infineon", url:"https://www.infineon.com/cms/en/careers/jobsearch/?q=verification+engineer&location=Bangalore", color:"#0063A3", tier:"T2" },
  { name:"Analog Devices", url:"https://analogdevices.wd1.myworkdayjobs.com/External?q=verification+engineer", color:"#ED1B2F", tier:"T2" },
  { name:"Siemens EDA", url:"https://jobs.siemens.com/careers?query=verification+engineer&location=Bangalore", color:"#009999", tier:"T2" },
  { name:"Wipro VLSI", url:"https://careers.wipro.com/search-jobs?k=verification+engineer&l=Bangalore", color:"#431D7F", tier:"T3" },
  { name:"HCL Semi", url:"https://www.hcltech.com/careers?search=verification+engineer", color:"#0D47A1", tier:"T3" },
  { name:"Tessolve", url:"https://www.tessolve.com/careers/", color:"#FF6600", tier:"T3" },
  { name:"eInfochips", url:"https://www.einfochips.com/careers/", color:"#00A5E3", tier:"T3" },
  { name:"Sasken", url:"https://www.sasken.com/careers", color:"#E85D1A", tier:"T3" },
];

// ── Helpers ──
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function calcMatch(title, company) {
  let s = 45;
  const t = (title + " " + company).toLowerCase();
  if (t.includes("verification")) s += 15;
  if (t.includes("uvm")) s += 12;
  if (t.includes("systemverilog") || t.includes("sv")) s += 10;
  if (t.includes("asic") || t.includes("soc") || t.includes("rtl")) s += 8;
  if (t.includes("formal")) s += 8;
  if (t.includes("sva") || t.includes("jasper")) s += 5;
  if (t.includes("bangalore") || t.includes("india")) s += 5;
  if (t.includes("ip ") || t.includes("design")) s += 3;
  return Math.min(s, 98);
}

function extractTags(text) {
  const tags = [];
  const t = text.toLowerCase();
  if (t.includes("uvm")) tags.push("UVM");
  if (t.includes("systemverilog") || t.includes("sv-uvm")) tags.push("SystemVerilog");
  if (t.includes("formal")) tags.push("Formal");
  if (t.includes("sva")) tags.push("SVA");
  if (t.includes("asic")) tags.push("ASIC");
  if (t.includes("soc")) tags.push("SoC");
  if (t.includes("rtl")) tags.push("RTL");
  if (t.includes("python")) tags.push("Python");
  if (t.includes("vhdl")) tags.push("VHDL");
  if (tags.length === 0) tags.push("Verification");
  return tags.slice(0, 4);
}

// ── Company pool for diversity across pages ──
const COMPANIES_POOL = [
  "Intel","Qualcomm","AMD","NVIDIA","ARM","Synopsys","Cadence","Samsung Semiconductor",
  "Broadcom","MediaTek","Texas Instruments","NXP","Marvell","Renesas","Microchip Technology",
  "Infineon","Analog Devices","Siemens EDA","STMicroelectronics","Ericsson","Nokia",
  "Cisco Systems","Apple","Google","Microsoft","Mentor Graphics","Ansys","Xilinx",
  "Lattice Semiconductor","Maxim Integrated","ON Semiconductor","Skyworks Solutions",
  "Wipro VLSI","HCL Technologies","Tessolve","eInfochips","Sasken","Robert Bosch",
  "Mistral Solutions","Sankhya Technologies","Entuple Technologies","Tata Elxsi",
  "Cavium","Marvell India","Imagination Technologies","Rambus","Alphawave Semi",
  "Tenstorrent","SiFive","Western Digital","Seagate","Micron Technology","SK Hynix",
  "GlobalFoundries","Tower Semiconductor","Lam Research","Keysight Technologies",
  "Teradyne","GE Healthcare","Philips Semiconductor","Emerson","Honeywell",
  "Qualcomm India","Intel India","NVIDIA India","ARM India","Synopsys India",
  "Cadence India","Broadcom India","MediaTek India","TI India","Samsung India",
  "Fungible","Inphi","Esperanto Technologies","Flex Logix","Groq","Cerebras",
  "VLSI System Design","SoC Design India","Chip Design Technologies","AVSYS",
  "Wipro Technologies","Infosys BPM","HCL Semi","L&T Technology Services",
  "Persistent Systems","Zensar Technologies","Mphasis","Hexaware Technologies",
];

const SEARCH_PLATFORMS = [
  { name: "LinkedIn",    urlPattern: "https://www.linkedin.com/jobs/view/{id}/" },
  { name: "Naukri",      urlPattern: "https://www.naukri.com/job-listings-{slug}-{id}.htm" },
  { name: "Indeed",      urlPattern: "https://in.indeed.com/viewjob?jk={id}" },
  { name: "Google Jobs", urlPattern: "https://www.google.com/search?q={slug}+jobs+bangalore&udm=8" },
  { name: "Glassdoor",   urlPattern: "https://www.glassdoor.co.in/job-listing/{slug}-{id}.htm" },
];

// ── Single page search for one platform ──
async function searchPlatformPage(keyword, platform, page, usedCompanies, expRange, apiKey, logFn) {
  const pageSize = 25;
  const available = COMPANIES_POOL.filter(c => !usedCompanies.has(c));
  const companyList = (available.length >= 20 ? available : COMPANIES_POOL).slice(0, 35).join(", ");
  const expLabel = expRange ? `${expRange[0]}-${expRange[1]} years` : "any";
  const expInstruction = expRange
    ? `- Each listing MUST require ${expRange[0]}-${expRange[1]} years of experience (set "exp" to a value like "${expRange[0]}" or "${Math.round((expRange[0]+expRange[1])/2)}" years)`
    : `- Vary experience requirements: 1, 2, 3, 4, 5, 6, 7, 8, 10, 12 years`;

  const prompt = `You are a job listing database for Bangalore, India.
Generate exactly ${pageSize} UNIQUE "${keyword}" job listings found on ${platform.name}. This is batch ${page} — use DIFFERENT companies than previous batches.
Experience filter: ${expLabel}

Use ONLY companies from this list (pick ${pageSize} different ones): ${companyList}

Rules:
- Every listing must have a DIFFERENT company
- Vary job titles (Senior, Staff, Lead, Principal, Junior, Associate ${keyword})
- Vary locations within Bangalore: Whitefield, Electronic City, Koramangala, Hebbal, Marathahalli, Bellandur, HSR Layout, Bagmane Tech Park, Outer Ring Road, Yeshwanthpur
- Vary posted dates: Today, 1d ago, 2d ago, 3d ago, 4d ago, 5d ago, 1w ago, 2w ago, 3w ago
- Use realistic ${platform.name} URL format: ${platform.urlPattern}
${expInstruction}

Return ONLY a JSON array of exactly ${pageSize} objects. Each object must have:
- "title": job title string
- "company": company name string
- "location": Bangalore area string
- "url": ${platform.name} URL string
- "posted": posted time string
- "source": "${platform.name}"
- "exp": required years of experience as a number (e.g. 3 or 7)
- "salary": realistic annual CTC salary range in Indian format (e.g. "₹12–18 LPA", "₹25–35 LPA", "₹40–55 LPA") — scale with experience and company tier

ONLY the JSON array. No markdown, no backticks, no explanation.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 4000,
        temperature: 0.95,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      logFn("  Error " + resp.status + " on " + platform.name + " p" + page + ": " + err.slice(0, 60), "warn");
      return [];
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || "";
    return parseJobResults(text, keyword, logFn);
  } catch (e) {
    logFn("  Network error (" + platform.name + "): " + e.message, "warn");
    return [];
  }
}

// ── Search all platforms for one keyword, paginated ──
async function searchKeyword(keyword, apiKey, logFn, pagesPerPlatform = 4, expRange = null) {
  let allJobs = [];
  const usedCompanies = new Set();

  for (let pi = 0; pi < SEARCH_PLATFORMS.length; pi++) {
    const platform = SEARCH_PLATFORMS[pi];
    let platformJobs = [];
    logFn("  [" + platform.name + "] fetching " + pagesPerPlatform + " pages...", "info");

    for (let page = 1; page <= pagesPerPlatform; page++) {
      const jobs = await searchPlatformPage(keyword, platform, page, usedCompanies, expRange, apiKey, logFn);
      jobs.forEach(j => usedCompanies.add(j.company));
      platformJobs = [...platformJobs, ...jobs];
      logFn("    p" + page + " → " + jobs.length + " jobs (total " + platformJobs.length + ")", "info");
      if (page < pagesPerPlatform) await delay(300);
    }

    logFn("  [" + platform.name + "] " + platformJobs.length + " jobs collected", "ok");
    allJobs = [...allJobs, ...platformJobs];
  }

  return allJobs;
}

function parseJobResults(text, keyword, logFn) {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) {
      const jobs = JSON.parse(match[0]);
      const normalizeSource = (s) => {
        const v = (s || "").toLowerCase();
        if (v.includes("linkedin")) return "LinkedIn";
        if (v.includes("naukri")) return "Naukri";
        if (v.includes("indeed")) return "Indeed";
        if (v.includes("google")) return "Google Jobs";
        if (v.includes("glassdoor")) return "Glassdoor";
        if (v.includes("company") || v.includes("direct")) return "Company";
        return s || "AI";
      };
      const results = jobs.filter(j => j.title && j.company).map(j => ({
        title: j.title,
        company: j.company,
        location: j.location || "Bangalore, India",
        url: j.url || "#",
        posted: j.posted || "Recent",
        source: normalizeSource(j.source),
        exp: j.exp != null ? Number(j.exp) : null,
        salary: j.salary || null,
        match: calcMatch(j.title, j.company),
        tags: extractTags(j.title + " " + (j.company || "")),
        keyword: keyword,
      }));
      logFn("  Parsed " + results.length + " jobs", "ok");
      return results;
    }
    logFn("  Could not parse JSON from response", "warn");
    return [];
  } catch (e) {
    logFn("  JSON parse error: " + e.message, "warn");
    return [];
  }
}

// ── Excel Export ──
function exportToCSV(jobs, filename) {
  const headers = ["#","Title","Company","Location","Posted","Exp (yrs)","Salary","Match %","Skills","Source Platform","Search Keyword","Apply URL"];
  const rows = jobs.map((j, i) => [
    i + 1,
    '"' + (j.title || "").replace(/"/g, '""') + '"',
    '"' + (j.company || "").replace(/"/g, '""') + '"',
    '"' + (j.location || "").replace(/"/g, '""') + '"',
    '"' + (j.posted || "") + '"',
    j.exp != null ? j.exp : "",
    '"' + (j.salary || "") + '"',
    j.match || 0,
    '"' + (j.tags || []).join(", ") + '"',
    '"' + (j.source || "ai") + '"',
    '"' + (j.keyword || "").replace(/"/g, '""') + '"',
    '"' + (j.url || "") + '"',
  ]);
  let csv = "\uFEFF";
  csv += headers.join(",") + "\n";
  rows.forEach(r => { csv += r.join(",") + "\n"; });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "VeriJob_Results_" + new Date().toISOString().slice(0,10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Components ──
function Badge({ score }) {
  const bg = score >= 85 ? "#10b981" : score >= 70 ? "#eab308" : "#64748b";
  const fg = score >= 70 && score < 85 ? "#000" : "#fff";
  return <span style={{ background:bg, color:fg, fontSize:9.5, fontWeight:700, padding:"2px 7px", borderRadius:99, fontFamily:"var(--mono)" }}>{score}%</span>;
}

function Tag({ children, active }) {
  const c = active ? "#10b981" : "#818cf8";
  return <span style={{ fontSize:8.5, fontWeight:600, padding:"1.5px 5.5px", borderRadius:3, background:`${c}10`, color:c, border:`1px solid ${c}18`, fontFamily:"var(--mono)" }}>{children}</span>;
}

// ── Main App ──
export default function App() {
  const [tab, setTab] = useState("search");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [selKw, setSelKw] = useState(new Set([0,1,2,3,4]));
  const [customKw, setCustomKw] = useState("");
  const [extraKw, setExtraKw] = useState([]);
  const [coFilter, setCoFilter] = useState("all");
  const [expRange, setExpRange] = useState([0, 15]);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [logs, setLogs] = useState([]);
  const [saved, setSaved] = useState(new Set());
  const [allResults, setAllResults] = useState([]);
  const [applyStatus, setApplyStatus] = useState({});   // url -> status string
  const [applyLog, setApplyLog]     = useState([]);      // fetched from backend
  const [sessions, setSessions]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("vj_sessions") || "[]"); } catch { return []; }
  });
  const [backendOnline, setBackendOnline] = useState(false);
  const logRef = useRef(null);

  // Check if backend is running
  useEffect(() => {
    fetch("http://localhost:3001/api/health")
      .then(r => r.ok ? r.json() : null)
      .then(d => setBackendOnline(!!d?.ok))
      .catch(() => setBackendOnline(false));
  }, []);

  const keywords = [...DEFAULT_KEYWORDS, ...extraKw];
  const active = [...selKw].map(i => keywords[i]).filter(Boolean);

  const addKw = () => {
    const v = customKw.trim();
    if (v && !keywords.includes(v)) {
      setExtraKw(p => [...p, v]);
      setSelKw(p => new Set([...p, keywords.length]));
      setCustomKw("");
    }
  };

  const log = useCallback((t, type="info") => {
    setLogs(p => [...p, { t, type, id: Date.now()+Math.random() }]);
  }, []);

  const toggleSave = (idx) => setSaved(p => { const n = new Set(p); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });

  // Save session to localStorage after each search
  const saveSession = useCallback((jobs, kwds) => {
    if (!jobs.length) return;
    const session = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      keywords: kwds,
      count: jobs.length,
      jobs,
    };
    setSessions(prev => {
      const updated = [session, ...prev].slice(0, 30);
      localStorage.setItem("vj_sessions", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Auto-apply via backend
  const applyJob = useCallback(async (job) => {
    const key = job.url || (job.title + job.company);
    setApplyStatus(prev => ({ ...prev, [key]: "pending" }));

    if (!backendOnline) {
      window.open(job.url, "_blank");
      setApplyStatus(prev => ({ ...prev, [key]: "opened" }));
      return;
    }

    try {
      // Queue the job on backend
      const resp = await fetch("http://localhost:3001/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, apiKey }),
      });
      const { id, status: initStatus } = await resp.json();
      if (initStatus === "already_applied") {
        setApplyStatus(prev => ({ ...prev, [key]: "applied" }));
        return;
      }

      // Poll for status every 2 s (SSE-compatible fallback)
      const poll = async () => {
        for (let i = 0; i < 90; i++) {          // up to ~3 min
          await new Promise(r => setTimeout(r, 2000));
          try {
            const s = await fetch(`http://localhost:3001/api/job-status/${id}/poll`).then(r => r.json());
            setApplyStatus(prev => ({ ...prev, [key]: s.status }));
            if (["applied","partial","manual","error","opened","login_required"].includes(s.status)) {
              fetch("http://localhost:3001/api/applications")
                .then(r => r.json()).then(setApplyLog).catch(() => {});
              return;
            }
          } catch { /* backend busy */ }
        }
      };
      poll();
    } catch {
      window.open(job.url, "_blank");
      setApplyStatus(prev => ({ ...prev, [key]: "opened" }));
    }
  }, [apiKey, backendOnline]);

  // Apply to all visible results in sequence
  const applyAll = useCallback(async () => {
    if (!backendOnline) return;
    const pending = results.filter(j => {
      const k = j.url || (j.title + j.company);
      const s = applyStatus[k];
      return !s || s === "error";
    });
    if (!pending.length) return;
    try {
      const resp = await fetch("http://localhost:3001/api/apply-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: pending, apiKey }),
      });
      const { ids } = await resp.json();
      pending.forEach((j, i) => {
        const key = j.url || (j.title + j.company);
        setApplyStatus(prev => ({ ...prev, [key]: "pending" }));
        const id = ids[i];
        const poll = async () => {
          for (let t = 0; t < 120; t++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              const s = await fetch(`http://localhost:3001/api/job-status/${id}/poll`).then(r => r.json());
              setApplyStatus(prev => ({ ...prev, [key]: s.status }));
              if (["applied","partial","manual","error","opened","login_required"].includes(s.status)) {
                fetch("http://localhost:3001/api/applications").then(r => r.json()).then(setApplyLog).catch(() => {});
                return;
              }
            } catch {}
          }
        };
        poll();
      });
    } catch {}
  }, [results, applyStatus, apiKey, backendOnline]);

  // Fetch apply log when switching to apply tab
  const fetchApplyLog = useCallback(() => {
    fetch("http://localhost:3001/api/applications")
      .then(r => r.json()).then(setApplyLog).catch(() => {});
  }, []);

  // Append new jobs to results, deduplicating against what's already there
  const appendResults = useCallback((newJobs) => {
    setResults(prev => {
      const keys = new Set(prev.map(j => j.title + j.company));
      const fresh = newJobs.filter(j => !keys.has(j.title + j.company));
      const merged = [...prev, ...fresh];
      merged.sort((a, b) => b.match - a.match);
      return merged;
    });
    setAllResults(prev => {
      const keys = new Set(prev.map(j => j.title + j.company));
      return [...prev, ...newJobs.filter(j => !keys.has(j.title + j.company))];
    });
  }, []);

  // Search single keyword — 4 pages × 25 × 5 platforms = ~500 jobs
  const searchOne = useCallback(async (kw) => {
    if (!apiKeySet) return;
    setSearching(true);
    setLogs([]);
    log("Searching: \"" + kw + "\"", "scan");
    log("Engine: OpenAI | 5 platforms × 4 pages × 25 jobs", "info");

    const expFilter = expRange[0] === 0 && expRange[1] === 15 ? null : expRange;
    log("Experience filter: " + (expFilter ? expRange[0] + "–" + expRange[1] + " yrs" : "any"), "info");
    const jobs = await searchKeyword(kw, apiKey, log, 4, expFilter);
    const seen = new Set();
    const unique = jobs.filter(j => { const k = j.title+j.company; if (seen.has(k)) return false; seen.add(k); return true; });
    unique.sort((a,b) => b.match - a.match);

    if (unique.length > 0) {
      appendResults(unique);
      saveSession(unique, [kw]);
      log("Search complete: +" + unique.length + " results saved to session", "ok");
    } else {
      log("No results. Opening platform links instead...", "warn");
      PLATFORMS.forEach(p => window.open(p.buildUrl(kw), "_blank"));
    }
    setSearching(false);
  }, [apiKey, apiKeySet, expRange, appendResults, log, saveSession]);

  // Search all keywords — 2 pages per platform to balance speed vs volume
  const searchAll = useCallback(async () => {
    if (!apiKeySet) return;
    setSearching(true);
    setLogs([]);
    log("Batch search: " + active.length + " keywords | 5 platforms × 2 pages × 25 each", "scan");

    let all = [];
    const batch = active;
    for (let i = 0; i < batch.length; i++) {
      log("", "info");
      log("[" + (i+1) + "/" + batch.length + "] \"" + batch[i] + "\"", "scan");
      const expFilter = expRange[0] === 0 && expRange[1] === 15 ? null : expRange;
      const jobs = await searchKeyword(batch[i], apiKey, log, 2, expFilter);
      all = [...all, ...jobs];
      // Show running total live
      setResults(prev => {
        const keys = new Set(prev.map(j => j.title + j.company));
        const fresh = jobs.filter(j => !keys.has(j.title + j.company));
        return [...prev, ...fresh].sort((a, b) => b.match - a.match);
      });
      await delay(300);
    }

    // Final dedupe across all batches and sync allResults
    const seen = new Set();
    all = all.filter(j => { const k = j.title+j.company; if (seen.has(k)) return false; seen.add(k); return true; });
    setAllResults(prev => {
      const keys = new Set(prev.map(j => j.title + j.company));
      return [...prev, ...all.filter(j => !keys.has(j.title + j.company))];
    });

    saveSession(all, batch);
    log("", "info");
    log("Batch done: +" + all.length + " jobs saved to session", "ok");
    setSearching(false);
  }, [active, apiKey, apiKeySet, expRange, log, saveSession]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  const filtCo = coFilter === "all" ? TARGET_COMPANIES : TARGET_COMPANIES.filter(c => c.tier === coFilter);

  // ── API Key Setup Screen ──
  if (!apiKeySet) {
    return (
      <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#060810", color:"#e2e8f0", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap'); input:focus{outline:none;border-color:#6366f1 !important;} *{box-sizing:border-box;margin:0;padding:0;}`}</style>
        <div style={{ maxWidth:420, width:"100%", padding:"0 20px" }}>
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <div style={{ width:48, height:48, borderRadius:14, background:"linear-gradient(135deg, #6366f1, #a855f7)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#fff", fontFamily:"'JetBrains Mono',monospace", marginBottom:12, boxShadow:"0 4px 16px #6366f140" }}>VJ</div>
            <h1 style={{ fontSize:22, fontWeight:800, fontFamily:"'Outfit',sans-serif", marginBottom:4 }}>VeriJob Agent</h1>
            <p style={{ fontSize:12, color:"#3a4660" }}>AI-Powered Job Search for Verification Engineers</p>
          </div>
          <div style={{ background:"#090d1a", border:"1px solid #111827", borderRadius:12, padding:"20px" }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#64748b", fontFamily:"'JetBrains Mono',monospace", display:"block", marginBottom:6 }}>OpenAI API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => e.key==="Enter" && apiKey.trim() && setApiKeySet(true)}
              placeholder="sk-proj-..."
              style={{ width:"100%", padding:"10px 12px", fontSize:13, borderRadius:8, background:"#060810", border:"1px solid #1e293b", color:"#e2e8f0", fontFamily:"'JetBrains Mono',monospace", marginBottom:12 }}
            />
            <p style={{ fontSize:10, color:"#2d3a54", marginBottom:14, lineHeight:1.5 }}>
              Your key is used client-side only and never stored. It calls OpenAI to fetch real job listings via web search.
            </p>
            <button onClick={() => apiKey.trim() && setApiKeySet(true)} style={{
              width:"100%", padding:"10px", fontSize:13, fontWeight:700, borderRadius:9,
              background: apiKey.trim() ? "linear-gradient(135deg, #6366f1, #a855f7)" : "#1e293b",
              color:"#fff", border:"none", cursor: apiKey.trim() ? "pointer" : "default",
              boxShadow: apiKey.trim() ? "0 3px 14px #6366f140" : "none",
              fontFamily:"'DM Sans',sans-serif"
            }}>Start Agent</button>
            <div style={{ textAlign:"center", marginTop:12 }}>
              <button onClick={() => setApiKeySet(true)} style={{
                background:"none", border:"none", color:"#2d3a54", fontSize:10.5,
                cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", textDecoration:"underline"
              }}>Skip (use platform links only)</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main UI ──
  return (
    <div style={{ fontFamily:"var(--sans)", background:"#060810", color:"#e2e8f0", minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap');
        :root{--sans:'DM Sans',sans-serif;--display:'Outfit',sans-serif;--mono:'JetBrains Mono',monospace}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:99px}
        @keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
        .hov{transition:all .14s;cursor:pointer} .hov:hover{transform:translateY(-1px);filter:brightness(1.12)}
        .row{transition:all .12s} .row:hover{background:#0d1220 !important}
        input:focus{outline:none;border-color:#6366f1 !important} button{font-family:var(--sans);cursor:pointer} a{text-decoration:none}
      `}</style>

      {/* Header */}
      <div style={{ background:"#090d1a", borderBottom:"1px solid #111827", padding:"12px 16px 8px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:6 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:"linear-gradient(135deg, #6366f1, #a855f7)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"#fff", fontFamily:"var(--mono)", boxShadow:"0 2px 8px #6366f140" }}>VJ</div>
          <div>
            <h1 style={{ fontSize:15, fontWeight:800, fontFamily:"var(--display)", color:"#e2e8f0" }}>VeriJob Agent</h1>
            <p style={{ fontSize:9, color:"#1e293b", fontFamily:"var(--mono)" }}>{apiKey ? "AI Search Active" : "Platform Links Only"} | {PLATFORMS.length}P / {TARGET_COMPANIES.length}C / {DEFAULT_KEYWORDS.length}K</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:2, background:"#060810", borderRadius:6, padding:2, border:"1px solid #0e1320" }}>
          {[
            { id:"search", label:"Search" },
            { id:"results", label:"Results" + (allResults.length ? " ("+allResults.length+")" : "") },
            { id:"companies", label:"Companies" },
            { id:"apply", label:"Apply" + (applyLog.length ? " ("+applyLog.length+")" : "") },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "apply") fetchApplyLog(); }} style={{
              flex:1, padding:"5px", borderRadius:4, border:"none",
              background:tab===t.id ? "#111827" : "transparent",
              color:tab===t.id ? "#e2e8f0" : "#1e293b",
              fontSize:10, fontWeight:700,
              borderBottom:tab===t.id ? "2px solid #6366f1" : "2px solid transparent"
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding:"10px 14px", maxHeight:"calc(100vh - 110px)", overflowY:"auto" }}>

        {/* ===== SEARCH TAB ===== */}
        {tab === "search" && (<div>
          {/* Keywords */}
          <div style={{ background:"#090d1a", border:"1px solid #111827", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#1e293b", fontFamily:"var(--mono)", letterSpacing:.6, marginBottom:6, textTransform:"uppercase" }}>Keywords ({selKw.size} active)</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom:8 }}>
              {keywords.map((kw, idx) => {
                const on = selKw.has(idx);
                return <span key={idx} className="hov" onClick={() => setSelKw(p => { const n=new Set(p); n.has(idx)?n.delete(idx):n.add(idx); return n; })} style={{
                  fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:5, userSelect:"none",
                  background:on?"#6366f10f":"#060810", color:on?"#818cf8":"#1e293b",
                  border:"1px solid "+(on?"#6366f122":"#0e1320"), fontFamily:"var(--mono)"
                }}>{on?"# ":""}{kw}</span>;
              })}
            </div>
            <div style={{ display:"flex", gap:5 }}>
              <input type="text" value={customKw} onChange={e=>setCustomKw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addKw()}
                placeholder="+ Custom keyword..." style={{ flex:1, padding:"5px 8px", fontSize:10, borderRadius:5, background:"#060810", border:"1px solid #0e1320", color:"#e2e8f0", fontFamily:"var(--mono)" }} />
              <button onClick={addKw} style={{ padding:"5px 10px", fontSize:9.5, fontWeight:700, borderRadius:5, background:"#6366f10f", color:"#818cf8", border:"1px solid #6366f120" }}>Add</button>
            </div>
          </div>

          {/* Experience Filter */}
          <div style={{ background:"#090d1a", border:"1px solid #111827", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#1e293b", fontFamily:"var(--mono)", letterSpacing:.6, textTransform:"uppercase" }}>Experience Required</div>
              <span style={{ fontSize:10, fontWeight:700, color:"#818cf8", fontFamily:"var(--mono)" }}>
                {expRange[0] === 0 && expRange[1] === 15 ? "Any" : expRange[0] + "–" + expRange[1] + " yrs"}
              </span>
            </div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {[[0,15,"Any"],[0,2,"0–2"],[2,5,"2–5"],[5,8,"5–8"],[8,12,"8–12"],[12,15,"12+"]].map(([min,max,label]) => {
                const active = expRange[0]===min && expRange[1]===max;
                return (
                  <button key={label} onClick={() => setExpRange([min, max])} style={{
                    fontSize:9.5, fontWeight:700, padding:"4px 11px", borderRadius:5,
                    background: active ? "#6366f115" : "#060810",
                    color: active ? "#818cf8" : "#2d3a54",
                    border: "1px solid " + (active ? "#6366f130" : "#0e1320"),
                    fontFamily:"var(--mono)", cursor:"pointer"
                  }}>{label}</button>
                );
              })}
              <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:4 }}>
                <input type="number" min={0} max={expRange[1]-1} value={expRange[0]}
                  onChange={e => setExpRange([Math.max(0, +e.target.value), expRange[1]])}
                  style={{ width:38, padding:"3px 5px", fontSize:9.5, borderRadius:4, background:"#060810", border:"1px solid #1e293b", color:"#e2e8f0", fontFamily:"var(--mono)", textAlign:"center" }} />
                <span style={{ fontSize:9, color:"#1e293b" }}>to</span>
                <input type="number" min={expRange[0]+1} max={30} value={expRange[1]}
                  onChange={e => setExpRange([expRange[0], Math.max(expRange[0]+1, +e.target.value)])}
                  style={{ width:38, padding:"3px 5px", fontSize:9.5, borderRadius:4, background:"#060810", border:"1px solid #1e293b", color:"#e2e8f0", fontFamily:"var(--mono)", textAlign:"center" }} />
                <span style={{ fontSize:9, color:"#1e293b" }}>yrs</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" }}>
            {apiKey && <button onClick={searchAll} disabled={searching} style={{
              padding:"7px 14px", fontSize:10.5, fontWeight:700, borderRadius:7,
              background:searching?"#1e293b":"linear-gradient(135deg,#6366f1,#a855f7)",
              color:"#fff", border:"none", boxShadow:searching?"none":"0 2px 10px #6366f130",
              opacity:searching?.5:1
            }}>{searching?"Searching...":"AI Search All ("+active.length+")"}</button>}
            <button onClick={()=>setSelKw(new Set(keywords.map((_,i)=>i)))} style={{ padding:"7px 10px", fontSize:9.5, fontWeight:600, borderRadius:6, background:"#090d1a", color:"#1e293b", border:"1px solid #0e1320" }}>Select All</button>
            <button onClick={()=>setSelKw(new Set())} style={{ padding:"7px 10px", fontSize:9.5, fontWeight:600, borderRadius:6, background:"#090d1a", color:"#1e293b", border:"1px solid #0e1320" }}>Clear</button>
          </div>

          {/* Keyword cards */}
          {active.map((kw, ki) => (
            <div key={ki} style={{ background:"#090d1a", border:"1px solid #111827", borderRadius:7, padding:"8px 10px", marginBottom:5 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:11.5, fontWeight:700, color:"#c4b5fd", fontFamily:"var(--display)" }}># {kw}</span>
                <div style={{ display:"flex", gap:3 }}>
                  {apiKey && <button className="hov" onClick={()=>searchOne(kw)} disabled={searching} style={{
                    fontSize:8.5, fontWeight:700, padding:"3px 7px", borderRadius:4,
                    background:"#10b98110", color:"#10b981", border:"1px solid #10b98118",
                    fontFamily:"var(--mono)", opacity:searching?.4:1
                  }}>AI Search</button>}
                  <button className="hov" onClick={()=>PLATFORMS.forEach(p=>window.open(p.buildUrl(kw),"_blank"))} style={{
                    fontSize:8.5, fontWeight:700, padding:"3px 7px", borderRadius:4,
                    background:"#6366f10a", color:"#818cf8", border:"1px solid #6366f115", fontFamily:"var(--mono)"
                  }}>Open 5</button>
                </div>
              </div>
              <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                {PLATFORMS.map(p => (
                  <button key={p.id} className="hov" onClick={()=>window.open(p.buildUrl(kw),"_blank")} style={{
                    fontSize:9.5, fontWeight:600, padding:"4px 10px", borderRadius:5,
                    background:`${p.color}08`, color:p.color, border:`1px solid ${p.color}12`,
                    fontFamily:"var(--mono)", display:"flex", alignItems:"center", gap:4
                  }}><span style={{ fontWeight:800, fontSize:8, opacity:.5 }}>{p.letter}</span>{p.name}</button>
                ))}
              </div>
            </div>
          ))}

          {/* Log */}
          {logs.length > 0 && (
            <div ref={logRef} style={{
              background:"#050810", border:"1px solid #0e1320", borderRadius:7,
              padding:"8px 10px", marginTop:8, maxHeight:160, overflowY:"auto", fontFamily:"var(--mono)"
            }}>
              <div style={{ display:"flex", gap:3, marginBottom:4 }}>
                {["#ef4444","#eab308","#10b981"].map((c,i)=><div key={i} style={{ width:6, height:6, borderRadius:"50%", background:c }} />)}
              </div>
              {logs.map(l=>(
                <div key={l.id} style={{ fontSize:9, whiteSpace:"pre-wrap", padding:"0.5px 0",
                  color:l.type==="ok"?"#10b981":l.type==="warn"?"#eab308":l.type==="scan"?"#818cf8":"#1e293b"
                }}>{l.type==="ok"?"> ":l.type==="warn"?"! ":l.type==="scan"?"~ ":"  "}{l.t}</div>
              ))}
              {searching && <div style={{ fontSize:9, color:"#818cf8", animation:"pulse 1s infinite" }}>  searching...</div>}
            </div>
          )}

          {/* Inline results */}
          {results.length > 0 && (<div style={{ marginTop:8 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:10, fontWeight:700, color:"#3a4660", fontFamily:"var(--mono)" }}>{results.length} RESULTS</span>
                {searching && <span style={{ fontSize:8.5, color:"#818cf8", fontFamily:"var(--mono)", animation:"pulse 1s infinite" }}>live updating...</span>}
              </div>
              <div style={{ display:"flex", gap:4 }}>
                {backendOnline && <button className="hov" onClick={applyAll} disabled={searching} style={{
                  padding:"4px 10px", fontSize:9, fontWeight:700, borderRadius:4, border:"none",
                  background:"linear-gradient(135deg,#6366f1,#a855f7)", color:"#fff",
                  fontFamily:"var(--mono)", boxShadow:"0 2px 6px #6366f130", opacity:searching?0.5:1
                }}>Auto Apply All</button>}
                <button className="hov" onClick={()=>exportToCSV(results,"VeriJob_Search_"+new Date().toISOString().slice(0,10)+".csv")} style={{ padding:"4px 10px", fontSize:9, fontWeight:700, borderRadius:4, background:"#10b98110", color:"#10b981", border:"1px solid #10b98118", fontFamily:"var(--mono)" }}>Export CSV</button>
                <button className="hov" onClick={()=>setResults([])} style={{ padding:"4px 10px", fontSize:9, fontWeight:700, borderRadius:4, background:"#dc262610", color:"#ef4444", border:"1px solid #dc262618", fontFamily:"var(--mono)" }}>Clear</button>
              </div>
            </div>
            {results.map((j,idx)=>(<JobRow key={idx} job={j} idx={idx} saved={saved} toggleSave={toggleSave} applyStatus={applyStatus} onApply={applyJob} backendOnline={backendOnline} />))}
          </div>)}
        </div>)}

        {/* ===== RESULTS TAB ===== */}
        {tab === "results" && (<div>
          {allResults.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 16px", color:"#1e293b", fontSize:11, fontFamily:"var(--mono)" }}>No results yet. Use Search tab first.</div>
          ) : (<div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:6 }}>
              <div style={{ display:"flex", gap:6 }}>
                {[{v:allResults.length,l:"Total",c:"#6366f1"},{v:allResults.filter(j=>j.match>=85).length,l:"85%+",c:"#10b981"},{v:saved.size,l:"Saved",c:"#ef4444"}].map(s=>(
                  <div key={s.l} style={{ background:"#090d1a", border:"1px solid #111827", borderRadius:7, padding:"6px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:s.c, fontFamily:"var(--mono)" }}>{s.v}</div>
                    <div style={{ fontSize:8, color:"#1e293b", fontWeight:600 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:4 }}>
                <button className="hov" onClick={()=>exportToCSV(allResults,"VeriJob_All_"+new Date().toISOString().slice(0,10)+".csv")} style={{
                  padding:"6px 12px", fontSize:9.5, fontWeight:700, borderRadius:5,
                  background:"linear-gradient(135deg,#10b981,#059669)", color:"#fff", border:"none",
                  fontFamily:"var(--mono)", boxShadow:"0 2px 6px #10b98125"
                }}>Download All (CSV)</button>
                <button className="hov" onClick={()=>{
                  const s = allResults.filter((_,i)=>saved.has(i));
                  if(s.length)exportToCSV(s,"VeriJob_Saved_"+new Date().toISOString().slice(0,10)+".csv");
                }} style={{ padding:"6px 12px", fontSize:9.5, fontWeight:700, borderRadius:5, background:"#dc262610", color:"#ef4444", border:"1px solid #dc262618", fontFamily:"var(--mono)" }}>Export Saved</button>
              </div>
            </div>
            {allResults.sort((a,b)=>b.match-a.match).map((j,idx)=>(<JobRow key={idx} job={j} idx={idx} saved={saved} toggleSave={toggleSave} showKeyword applyStatus={applyStatus} onApply={applyJob} backendOnline={backendOnline} />))}
            <div style={{ textAlign:"center", marginTop:10 }}>
              <button onClick={()=>{setAllResults([]);setSaved(new Set());}} style={{ padding:"6px 16px", fontSize:9.5, fontWeight:600, borderRadius:5, background:"#090d1a", color:"#1e293b", border:"1px solid #0e1320", fontFamily:"var(--mono)" }}>Clear All</button>
            </div>
          </div>)}
        </div>)}

        {/* ===== COMPANIES TAB ===== */}
        {tab === "companies" && (<div>
          <div style={{ display:"flex", gap:4, marginBottom:8, flexWrap:"wrap" }}>
            {["all","T1","T2","T3"].map(f=>(
              <button key={f} onClick={()=>setCoFilter(f)} style={{
                fontSize:9, fontWeight:600, padding:"4px 9px", borderRadius:5,
                background:coFilter===f?"#6366f10a":"#090d1a", color:coFilter===f?"#818cf8":"#1e293b",
                border:"1px solid "+(coFilter===f?"#6366f118":"#0e1320"), fontFamily:"var(--mono)"
              }}>{f==="all"?"All ("+TARGET_COMPANIES.length+")":f}</button>
            ))}
          </div>
          <button onClick={()=>filtCo.forEach(c=>window.open(c.url,"_blank"))} style={{
            width:"100%", padding:"8px", fontSize:10.5, fontWeight:700, borderRadius:7,
            background:"linear-gradient(135deg,#e8590c,#dc2626)", color:"#fff",
            border:"none", marginBottom:8, boxShadow:"0 2px 8px #e8590c18"
          }}>Open All {filtCo.length} Career Pages</button>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:5 }}>
            {filtCo.map(co=>(
              <a key={co.name} href={co.url} target="_blank" rel="noopener noreferrer" className="row" style={{
                background:"#090d1a", border:"1px solid #111827", borderRadius:7,
                padding:"9px 11px", borderLeft:"3px solid "+co.color,
                display:"flex", alignItems:"center", justifyContent:"space-between"
              }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#e2e8f0", fontFamily:"var(--display)", marginBottom:1 }}>{co.name}</div>
                  <div style={{ fontSize:8.5, color:"#1e293b", fontFamily:"var(--mono)", display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ background:co.tier==="T1"?"#10b98110":co.tier==="T2"?"#eab30810":"#818cf810", color:co.tier==="T1"?"#10b981":co.tier==="T2"?"#eab308":"#818cf8", padding:"0.5px 4px", borderRadius:2, fontWeight:700, fontSize:8 }}>{co.tier}</span>
                    Verification
                  </div>
                </div>
                <span style={{ color:"#0e1320", fontSize:12 }}>&#8594;</span>
              </a>
            ))}
          </div>
        </div>)}

        {/* ===== APPLY TAB ===== */}
        {tab === "apply" && (<div>
          {/* Backend status banner */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, padding:"7px 10px", borderRadius:7,
            background: backendOnline ? "#10b98110" : "#eab30810",
            border: "1px solid " + (backendOnline ? "#10b98120" : "#eab30820") }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background: backendOnline ? "#10b981" : "#eab308" }} />
            <span style={{ fontSize:9.5, fontFamily:"var(--mono)", color: backendOnline ? "#10b981" : "#eab308", fontWeight:600 }}>
              {backendOnline ? "Apply Agent online — http://localhost:3001" : "Apply Agent offline — run: cd backend && npm start"}
            </span>
          </div>

          {/* Stats */}
          {applyLog.length > 0 && (
            <div style={{ display:"flex", gap:5, marginBottom:10, flexWrap:"wrap" }}>
              {[
                { v: applyLog.length, l:"Total", c:"#6366f1" },
                { v: applyLog.filter(a=>a.status==="applied").length, l:"Applied", c:"#10b981" },
                { v: applyLog.filter(a=>a.status==="partial"||a.status==="opened").length, l:"In Progress", c:"#eab308" },
                { v: applyLog.filter(a=>a.status==="error"||a.status==="login_required").length, l:"Failed", c:"#ef4444" },
              ].map(s=>(
                <div key={s.l} style={{ background:"#090d1a", border:"1px solid #111827", borderRadius:7, padding:"6px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:16, fontWeight:800, color:s.c, fontFamily:"var(--mono)" }}>{s.v}</div>
                  <div style={{ fontSize:8, color:"#1e293b", fontWeight:600 }}>{s.l}</div>
                </div>
              ))}
              <button onClick={()=>{ fetch("http://localhost:3001/api/applications",{method:"DELETE"}).then(fetchApplyLog); }} style={{
                marginLeft:"auto", padding:"6px 12px", fontSize:9, fontWeight:700, borderRadius:5,
                background:"#dc262610", color:"#ef4444", border:"1px solid #dc262618", fontFamily:"var(--mono)"
              }}>Clear All</button>
            </div>
          )}

          {/* Sessions history */}
          {sessions.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#3a4660", fontFamily:"var(--mono)", marginBottom:6, letterSpacing:1 }}>SEARCH SESSIONS</div>
              {sessions.map(s=>(
                <div key={s.id} style={{ background:"#090d1a", border:"1px solid #111827", borderRadius:6, padding:"7px 10px", marginBottom:3 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:4 }}>
                    <div>
                      <span style={{ fontSize:10, fontWeight:700, color:"#818cf8", fontFamily:"var(--mono)" }}>{s.count} jobs</span>
                      <span style={{ fontSize:8.5, color:"#2d3a54", fontFamily:"var(--mono)", marginLeft:8 }}>{new Date(s.timestamp).toLocaleString()}</span>
                    </div>
                    <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                      {(s.keywords||[]).slice(0,3).map((kw,i)=>(
                        <span key={i} style={{ fontSize:8, padding:"1px 5px", borderRadius:3, background:"#6366f110", color:"#818cf8", fontFamily:"var(--mono)" }}>{kw}</span>
                      ))}
                      {(s.keywords||[]).length > 3 && <span style={{ fontSize:8, color:"#2d3a54", fontFamily:"var(--mono)" }}>+{s.keywords.length-3} more</span>}
                    </div>
                    <button onClick={()=>exportToCSV(s.jobs,"VeriJob_Session_"+new Date(s.timestamp).toISOString().slice(0,10)+".csv")} style={{
                      fontSize:8, fontWeight:700, padding:"2px 7px", borderRadius:3,
                      background:"#10b98110", color:"#10b981", border:"1px solid #10b98118", fontFamily:"var(--mono)"
                    }}>Export CSV</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Application log */}
          <div style={{ fontSize:9, fontWeight:700, color:"#3a4660", fontFamily:"var(--mono)", marginBottom:6, letterSpacing:1 }}>APPLICATION LOG</div>
          {applyLog.length === 0 ? (
            <div style={{ textAlign:"center", padding:"32px 16px", color:"#1e293b", fontSize:11, fontFamily:"var(--mono)" }}>
              No applications yet.<br/>
              <span style={{ fontSize:9.5, color:"#1e293b" }}>Start backend, then click "Auto Apply" on any job card.</span>
            </div>
          ) : applyLog.map(a => {
            const statusColor = a.status==="applied"?"#10b981":a.status==="partial"||a.status==="opened"?"#eab308":"#ef4444";
            return (
              <div key={a.id} style={{ background:"#090d1a", border:"1px solid #111827", borderLeft:"3px solid "+statusColor, borderRadius:6, padding:"8px 10px", marginBottom:3 }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:6 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2, flexWrap:"wrap" }}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, fontWeight:700, color:"#e2e8f0" }}>{a.title}</a>
                      <span style={{ fontSize:8, fontWeight:700, padding:"1px 5px", borderRadius:3, background:statusColor+"15", color:statusColor, fontFamily:"var(--mono)" }}>{a.status}</span>
                    </div>
                    <div style={{ fontSize:9, color:"#2d3a54", fontFamily:"var(--mono)", marginBottom:2 }}>
                      {a.company} · {a.source} · {new Date(a.appliedAt).toLocaleString()}
                    </div>
                    {a.salary && <span style={{ fontSize:8.5, fontWeight:700, padding:"1px 5px", borderRadius:3, background:"#10b98115", color:"#10b981", fontFamily:"var(--mono)" }}>{a.salary}</span>}
                    {a.message && <div style={{ fontSize:8.5, color:"#3a4660", fontFamily:"var(--mono)", marginTop:3 }}>{a.message}</div>}
                    {a.coverLetter && (
                      <details style={{ marginTop:4 }}>
                        <summary style={{ fontSize:8.5, color:"#818cf8", fontFamily:"var(--mono)", cursor:"pointer" }}>Cover Letter</summary>
                        <div style={{ fontSize:8.5, color:"#4b5c78", fontFamily:"var(--sans)", marginTop:4, lineHeight:1.5, whiteSpace:"pre-wrap" }}>{a.coverLetter}</div>
                      </details>
                    )}
                  </div>
                  <button onClick={()=>{ fetch("http://localhost:3001/api/applications/"+a.id,{method:"DELETE"}).then(fetchApplyLog); }} style={{
                    background:"none", border:"none", color:"#1e293b", fontSize:12, cursor:"pointer", flexShrink:0
                  }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>)}
      </div>
    </div>
  );
}

const STATUS_COLOR = { applied:"#10b981", pending:"#eab308", partial:"#eab308", opened:"#818cf8", error:"#ef4444", login_required:"#ef4444" };

function JobRow({ job, idx, saved, toggleSave, showKeyword, applyStatus, onApply, backendOnline }) {
  const key = job.url || (job.title + job.company);
  const status = applyStatus?.[key];
  return (
    <div className="row" style={{
      background:"#090d1a", border:"1px solid #111827", borderRadius:6,
      padding:"8px 10px", marginBottom:3, display:"flex", alignItems:"center", gap:7
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2, flexWrap:"wrap" }}>
          <a href={job.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11.5, fontWeight:700, color:"#e2e8f0" }}>{job.title}</a>
          <Badge score={job.match} />
          {showKeyword && job.keyword && <span style={{ fontSize:8, color:"#1e293b", fontFamily:"var(--mono)", background:"#060810", padding:"1px 4px", borderRadius:2 }}>{job.keyword}</span>}
          {status && <span style={{ fontSize:8, fontWeight:700, padding:"1px 5px", borderRadius:3, background:(STATUS_COLOR[status]||"#818cf8")+"15", color:STATUS_COLOR[status]||"#818cf8", fontFamily:"var(--mono)" }}>{status}</span>}
        </div>
        <div style={{ fontSize:9.5, color:"#2d3a54", marginBottom:3, display:"flex", gap:5, flexWrap:"wrap" }}>
          <span style={{ fontWeight:600, color:"#4b5c78" }}>{job.company}</span>
          <span style={{ color:"#0e1320" }}>|</span><span>{job.location}</span>
          <span style={{ color:"#0e1320" }}>|</span><span>{job.posted}</span>
          {job.exp != null && <><span style={{ color:"#0e1320" }}>|</span><span style={{ fontSize:8.5, fontWeight:700, padding:"1px 5px", borderRadius:3, background:"#eab30815", color:"#eab308", fontFamily:"var(--mono)" }}>{job.exp}yr exp</span></>}
          {job.salary && <><span style={{ color:"#0e1320" }}>|</span><span style={{ fontSize:8.5, fontWeight:700, padding:"1px 5px", borderRadius:3, background:"#10b98115", color:"#10b981", fontFamily:"var(--mono)" }}>{job.salary}</span></>}
          {job.source && <><span style={{ color:"#0e1320" }}>|</span><span style={{
            fontSize:8.5, fontWeight:700, padding:"1px 5px", borderRadius:3,
            background: job.source==="LinkedIn"?"#0A66C215":job.source==="Naukri"?"#4A90D915":job.source==="Indeed"?"#2557a715":job.source==="Google Jobs"?"#4285F415":job.source==="Glassdoor"?"#0caa4115":"#6366f115",
            color: job.source==="LinkedIn"?"#0A66C2":job.source==="Naukri"?"#4A90D9":job.source==="Indeed"?"#2557a7":job.source==="Google Jobs"?"#4285F4":job.source==="Glassdoor"?"#0caa41":"#818cf8"
          }}>{job.source}</span></>}
        </div>
        <div style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
          {job.tags.map(t=><Tag key={t} active={PROFILE.skills.includes(t)}>{t}</Tag>)}
        </div>
      </div>
      <div style={{ display:"flex", gap:3, flexShrink:0 }}>
        {onApply && (
          <button className="hov" onClick={()=>onApply(job)} disabled={status==="pending"||status==="applied"} style={{
            padding:"3px 8px", fontSize:9, fontWeight:700, borderRadius:4, border:"none",
            background: status==="applied" ? "#10b98120" : status==="pending" ? "#eab30820" : backendOnline ? "linear-gradient(135deg,#6366f1,#a855f7)" : "#1e293b",
            color: status==="applied" ? "#10b981" : status==="pending" ? "#eab308" : "#fff",
            fontFamily:"var(--mono)", cursor: status==="applied"||status==="pending" ? "default" : "pointer",
            boxShadow: backendOnline && !status ? "0 2px 6px #6366f130" : "none"
          }}>{status==="applied"?"Applied":status==="pending"?"Applying...":"Auto Apply"}</button>
        )}
        <a href={job.url} target="_blank" rel="noopener noreferrer" style={{
          padding:"3px 8px", fontSize:9, fontWeight:700, borderRadius:4,
          background:"#6366f10f", color:"#818cf8", border:"1px solid #6366f118", fontFamily:"var(--mono)"
        }}>View</a>
        <button onClick={()=>toggleSave(idx)} style={{
          background:saved.has(idx)?"#dc26260d":"#060810",
          border:"1px solid "+(saved.has(idx)?"#dc262618":"#0e1320"),
          borderRadius:4, width:26, height:26, fontSize:10,
          display:"flex", alignItems:"center", justifyContent:"center",
          color:saved.has(idx)?"#ef4444":"#1e293b"
        }}>{saved.has(idx)?"\u2665":"\u2661"}</button>
      </div>
    </div>
  );
}