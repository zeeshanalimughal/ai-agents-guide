// MULTI-AGENT PIPELINE: Research → Write → Edit
// npm install @google/generative-ai
// GEMINI_API_KEY=your_key node 06_multi_agent_pipeline.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper: Simple LLM call
async function llmCall(systemPrompt, userMessage, label) {
  console.log(`\n  🤖 ${label}...`);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userMessage);
  const text = result.response.text();
  console.log(`  ✅ ${label} done (${text.length} chars)`);
  return text;
}

// AGENT 1: Researcher
async function researcherAgent(topic) {
  return await llmCall(
    `You are a research specialist. Given a topic, produce:
     1. 5-7 key facts with specifics
     2. Recent trends (2023-2024)
     3. Important statistics or data points
     4. Common misconceptions to address
     Be factual and specific. Format as structured notes with clear sections.`,
    `Research topic in depth: ${topic}`,
    "Researcher Agent"
  );
}

// AGENT 2: Writer
async function writerAgent(topic, researchNotes, style) {
  return await llmCall(
    `You are a professional content writer. Given research notes, write a compelling article.
     Writing style: ${style}
     Requirements:
     - Catchy headline
     - Strong hook opening paragraph 
     - 3-4 body sections with headers
     - Clear actionable conclusion
     - Natural flowing prose (NO bullet points in the article)
     - Target length: 600-800 words`,
    `Topic: ${topic}\n\nResearch Notes:\n${researchNotes}`,
    "Writer Agent"
  );
}

// AGENT 3: Editor
async function editorAgent(article) {
  return await llmCall(
    `You are a senior editor at a top tech publication. Review and improve the article:
     1. Fix any grammatical errors or awkward phrasing
     2. Improve clarity and flow between sections  
     3. Strengthen the opening hook and closing
     4. Ensure consistent, engaging tone throughout
     5. Add a compelling meta description (1-2 sentences) at the very top as "META: ..."
     
     Return ONLY the improved article. No editorial commentary or explanations.`,
    `Review and improve:\n\n${article}`,
    "Editor Agent"
  );
}

// QUALITY CHECKER: Extra agent to score the final article
async function qualityAgent(article, originalTopic) {
  return await llmCall(
    `You are a content quality auditor. Score the article on:
     1. Relevance to topic (0-10)
     2. Clarity and readability (0-10)
     3. Factual accuracy apparent (0-10)
     4. Engagement level (0-10)
     5. Overall quality (0-10)
     
     Format: Score each criterion, give total, and 2-3 specific improvement suggestions.`,
    `Topic: ${originalTopic}\n\nArticle:\n${article}`,
    "Quality Agent"
  );
}

// ORCHESTRATOR: Runs the full pipeline
async function contentPipeline({ topic, style = "engaging tech blog post for developers" }) {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`🚀 CONTENT PIPELINE`);
  console.log(`📌 Topic: ${topic}`);
  console.log(`🎨 Style: ${style}`);
  console.log(`${"═".repeat(65)}`);

  const startTime = Date.now();

  // Sequential pipeline: each step feeds the next
  console.log("\n📚 STEP 1/4: Research");
  const research = await researcherAgent(topic);

  console.log("\n✍️  STEP 2/4: Write");
  const draft = await writerAgent(topic, research, style);

  console.log("\n🔍 STEP 3/4: Edit");
  const finalArticle = await editorAgent(draft);

  console.log("\n⭐ STEP 4/4: Quality Check");
  const qualityReport = await qualityAgent(finalArticle, topic);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${"═".repeat(65)}`);
  console.log(`📰 FINAL ARTICLE (pipeline took ${elapsed}s):`);
  console.log(`${"═".repeat(65)}\n`);
  console.log(finalArticle);

  console.log(`\n${"═".repeat(65)}`);
  console.log("⭐ QUALITY REPORT:");
  console.log(`${"═".repeat(65)}\n`);
  console.log(qualityReport);

  return { research, draft, finalArticle, qualityReport };
}

// Run the pipeline
contentPipeline({
  topic: "How AI agents are changing software development workflows in 2024",
  style: "informative but engaging blog post for software developers",
}).catch(console.error);
