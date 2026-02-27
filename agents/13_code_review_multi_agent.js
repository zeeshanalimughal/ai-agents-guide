// CODE REVIEW MULTI-AGENT — 3 parallel agents review code simultaneously
// Analyzer + Security Auditor + Improvement Suggester → combined report
// GEMINI_API_KEY=your_key node 13_code_review_multi_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Helper ───────────────────────────────────────────────────────────────────
async function reviewAgent(role, systemPrompt, code) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: systemPrompt });
  const result = await model.generateContent(`Review this code:\n\n\`\`\`javascript\n${code}\n\`\`\``);
  return result.response.text();
}

// ── Agent 1: Code Quality Analyzer ───────────────────────────────────────────
function analyzeQuality(code) {
  return reviewAgent("Quality Analyzer", `
    You are a senior code reviewer focused on code quality.
    Review the code and report on:
    - Code structure and readability (score /10)
    - Naming conventions
    - Error handling gaps
    - Performance issues
    Keep each point to 1-2 sentences. Format: ## Quality Analysis`, code);
}

// ── Agent 2: Security Auditor ─────────────────────────────────────────────────
function auditSecurity(code) {
  return reviewAgent("Security Auditor", `
    You are a security expert. Scan the code for:
    - SQL injection / XSS vulnerabilities
    - Exposed secrets or API keys
    - Missing input validation
    - Authentication/authorization issues
    Rate severity: 🔴 Critical / 🟡 Medium / 🟢 Low.
    Format: ## Security Audit`, code);
}

// ── Agent 3: Improvement Suggester ───────────────────────────────────────────
function suggestImprovements(code) {
  return reviewAgent("Improvement Suggester", `
    You are a staff engineer focused on best practices.
    Suggest concrete improvements for:
    - Modern JS patterns to adopt
    - Better abstractions or design patterns
    - Testing recommendations
    - Documentation gaps
    Provide short code snippets for the top 2 suggestions.
    Format: ## Improvement Suggestions`, code);
}

// ── Synthesizer: combines all 3 reviews ──────────────────────────────────────
async function synthesizeReport(quality, security, improvements, filename) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: `You are a lead engineer writing a final code review report.
    Combine three review sections into a concise executive summary.
    Add: overall score /10, top 3 priority actions, approve/request-changes verdict.`,
  });
  const result = await model.generateContent(
    `File: ${filename}\n\n${quality}\n\n${security}\n\n${improvements}`
  );
  return result.response.text();
}

// ── Main: runs all 3 agents in parallel ──────────────────────────────────────
async function codeReview(code, filename = "code.js") {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🔍 CODE REVIEW: ${filename}`);
  console.log("═".repeat(60));
  console.log("🚀 Running 3 review agents in parallel...\n");

  const start = Date.now();

  // All 3 run at the same time!
  const [quality, security, improvements] = await Promise.all([
    analyzeQuality(code).then((r) => { console.log("  ✅ Quality analysis done"); return r; }),
    auditSecurity(code).then((r)   => { console.log("  ✅ Security audit done");   return r; }),
    suggestImprovements(code).then((r) => { console.log("  ✅ Suggestions ready");  return r; }),
  ]);

  console.log("\n📝 Synthesizing final report...");
  const report = await synthesizeReport(quality, security, improvements, filename);

  console.log(`\n${"═".repeat(60)}`);
  console.log("📋 FULL REVIEW REPORT:\n");
  console.log(quality);
  console.log(security);
  console.log(improvements);
  console.log("\n" + "═".repeat(60));
  console.log("🏆 EXECUTIVE SUMMARY:\n");
  console.log(report);
  console.log(`\n⏱️  Completed in ${((Date.now() - start) / 1000).toFixed(1)}s (parallel review)`);
}

// ── Sample code to review ─────────────────────────────────────────────────────
const sampleCode = `
const express = require('express');
const mysql = require('mysql');
const app = express();

const db = mysql.createConnection({
  host: 'localhost', user: 'root',
  password: 'admin123', database: 'users_db'
});

app.get('/user', (req, res) => {
  const id = req.query.id;
  const query = "SELECT * FROM users WHERE id = " + id;
  db.query(query, (err, results) => {
    if (err) throw err;
    res.send(results);
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const q = "SELECT * FROM users WHERE username='" + username + "' AND password='" + password + "'";
  db.query(q, (err, r) => {
    if (r.length > 0) res.send({ token: 'secret_token_123', user: r[0] });
    else res.status(401).send('Login failed');
  });
});

app.listen(3000);
`;

codeReview(sampleCode, "auth-server.js").catch(console.error);
