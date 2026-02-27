// NEWS DIGEST MULTI-AGENT — 3 agents: Fetcher → Summarizer → Briefing Writer
// Real-world use: auto-generate your daily news briefing
// GEMINI_API_KEY=your_key node 11_news_digest_multi_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const https = require("https");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Helper: call Gemini without tools ────────────────────────────────────────
async function llm(system, user) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: system });
  const r = await model.generateContent(user);
  return r.response.text();
}

// ── Helper: fetch real headlines from HackerNews (free, no key needed) ───────
function fetchHNStories(count = 8) {
  return new Promise((resolve) => {
    https.get("https://hacker-news.firebaseio.com/v0/topstories.json", (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", async () => {
        try {
          const ids = JSON.parse(data).slice(0, count);
          const stories = await Promise.all(
            ids.map(
              (id) =>
                new Promise((r) => {
                  https.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, (res2) => {
                    let d2 = "";
                    res2.on("data", (c) => (d2 += c));
                    res2.on("end", () => r(JSON.parse(d2)));
                  });
                })
            )
          );
          resolve(stories.map((s) => ({ title: s.title, url: s.url, score: s.score, by: s.by })));
        } catch {
          resolve([{ title: "AI agents are transforming software development", score: 450 },
                   { title: "New JavaScript runtime beats Node.js in benchmarks", score: 380 },
                   { title: "Open source LLMs reach GPT-4 level performance", score: 510 }]);
        }
      });
    }).on("error", () => resolve([
      { title: "AI agents are transforming software development", score: 450 },
      { title: "New JavaScript runtime beats Node.js in benchmarks", score: 380 },
    ]));
  });
}

// ── AGENT 1: Fetcher — gets raw headlines ────────────────────────────────────
async function fetcherAgent(topic) {
  console.log("\n📡 Agent 1 (Fetcher): Getting headlines...");
  const stories = await fetchHNStories(8);
  console.log(`  ✅ Fetched ${stories.length} stories`);
  return stories;
}

// ── AGENT 2: Categorizer — sorts by topic ────────────────────────────────────
async function categorizerAgent(stories, topic) {
  console.log("\n🗂️  Agent 2 (Categorizer): Sorting into categories...");
  const result = await llm(
    `You are a news editor. Categorize the given headlines into groups like: 
     AI/ML, Software Dev, Business, Security, Science, Other.
     Return JSON only: { "AI/ML": [...titles], "Software Dev": [...titles], ... }`,
    `Categorize these headlines:\n${stories.map((s, i) => `${i + 1}. ${s.title} (score: ${s.score})`).join("\n")}`
  );
  console.log("  ✅ Categorized");
  try {
    return JSON.parse(result.replace(/```json|```/g, "").trim());
  } catch {
    return { "Top Stories": stories.map((s) => s.title) };
  }
}

// ── AGENT 3: Briefing Writer — creates final digest ──────────────────────────
async function briefingAgent(categorized, tone) {
  console.log("\n✍️  Agent 3 (Briefing Writer): Writing digest...");
  const result = await llm(
    `You are a tech journalist writing a concise daily briefing.
     Style: ${tone}. Max 3 sentences per category. No fluff.
     Format: ## Category\nBrief summary of stories.`,
    `Write a daily digest from these categorized stories:\n${JSON.stringify(categorized, null, 2)}`
  );
  console.log("  ✅ Briefing ready");
  return result;
}

// ── ORCHESTRATOR ─────────────────────────────────────────────────────────────
async function newsDigestPipeline({ topic = "tech", tone = "professional but engaging" } = {}) {
  console.log("═".repeat(55));
  console.log(`📰 NEWS DIGEST PIPELINE — Topic: ${topic}`);
  console.log("═".repeat(55));

  const start = Date.now();

  const stories    = await fetcherAgent(topic);
  const categorized = await categorizerAgent(stories, topic);
  const digest     = await briefingAgent(categorized, tone);

  console.log(`\n${"═".repeat(55)}`);
  console.log("📋 YOUR DAILY DIGEST:\n");
  console.log(digest);
  console.log(`\n⏱️  Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

newsDigestPipeline({ tone: "casual and witty, like a friend summarizing the news" })
  .catch(console.error);
