// RESEARCH AGENT — Searches web, saves notes, reads files
// npm install @google/generative-ai
// GEMINI_API_KEY=your_key node examples/05_research_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const https = require("https");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const NOTES_DIR = "./research_notes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOOL IMPLEMENTATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Tool 1: Web search using DuckDuckGo Instant Answers (free, no key needed)
async function web_search({ query }) {
  return new Promise((resolve) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    https
      .get(url, { headers: { "User-Agent": "research-agent/1.0" } }, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const result = {
              query,
              abstract: json.AbstractText || "No summary available for this query",
              source: json.AbstractSource || "",
              sourceUrl: json.AbstractURL || "",
              answer: json.Answer || "",
              relatedTopics: (json.RelatedTopics || [])
                .slice(0, 5)
                .map((t) => t.Text || "")
                .filter(Boolean),
              definition: json.Definition || "",
            };
            resolve(result);
          } catch {
            resolve({ query, error: "Could not parse search results", abstract: `Search performed for: ${query}` });
          }
        });
      })
      .on("error", () => resolve({ query, error: "Network error — search unavailable", abstract: `Search attempted for: ${query}` }));
  });
}

// Tool 2: Save notes to a file
function save_note({ filename, content, append = false }) {
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
  }

  // Sanitize filename
  const safe = filename.replace(/[^a-z0-9\-_.]/gi, "_");
  const filepath = path.join(NOTES_DIR, safe);

  if (append && fs.existsSync(filepath)) {
    fs.appendFileSync(filepath, "\n\n" + content, "utf-8");
  } else {
    fs.writeFileSync(filepath, content, "utf-8");
  }

  const size = fs.statSync(filepath).size;
  return { success: true, filepath, filename: safe, sizeBytes: size };
}

// Tool 3: Read saved notes
function read_note({ filename }) {
  const safe = filename.replace(/[^a-z0-9\-_.]/gi, "_");
  const filepath = path.join(NOTES_DIR, safe);

  if (!fs.existsSync(filepath)) {
    return { error: `File "${filename}" not found. Use list_notes to see available files.` };
  }

  const content = fs.readFileSync(filepath, "utf-8");
  return { filename: safe, content, sizeBytes: content.length };
}

// Tool 4: List all saved notes
function list_notes() {
  if (!fs.existsSync(NOTES_DIR)) {
    return { files: [], message: "No notes directory yet. Save a note first." };
  }

  const files = fs.readdirSync(NOTES_DIR).map((f) => {
    const stat = fs.statSync(path.join(NOTES_DIR, f));
    return { filename: f, sizeBytes: stat.size, modified: stat.mtime.toISOString().split("T")[0] };
  });

  return { files, count: files.length };
}

// Tool 5: Delete a note
function delete_note({ filename }) {
  const safe = filename.replace(/[^a-z0-9\-_.]/gi, "_");
  const filepath = path.join(NOTES_DIR, safe);

  if (!fs.existsSync(filepath)) {
    return { error: `File "${filename}" not found` };
  }

  fs.unlinkSync(filepath);
  return { success: true, deleted: safe };
}

// Tool 6: Get current date/time
function get_datetime() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    date: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    time: now.toLocaleTimeString(),
    timestamp: Date.now(),
  };
}

// Tool 7: Summarize multiple notes into one
function merge_notes({ filenames, output_filename }) {
  const contents = filenames.map((f) => {
    const result = read_note({ filename: f });
    if (result.error) return `## ${f}\n(not found)`;
    return `## ${f}\n${result.content}`;
  });

  const merged = contents.join("\n\n---\n\n");
  return save_note({ filename: output_filename, content: merged });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tool map and declarations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const toolMap = { web_search, save_note, read_note, list_notes, delete_note, get_datetime, merge_notes };

const toolDeclarations = [
  {
    functionDeclarations: [
      {
        name: "web_search",
        description: "Search the web for information on any topic. Returns summary and related topics.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "The search query" } },
          required: ["query"],
        },
      },
      {
        name: "save_note",
        description: "Save research notes or content to a file for later reference",
        parameters: {
          type: "OBJECT",
          properties: {
            filename: { type: "STRING", description: "Filename like 'nodejs-notes.md' or 'ai-research.txt'" },
            content: { type: "STRING", description: "Content to save to the file" },
            append: { type: "BOOLEAN", description: "If true, append to existing file instead of overwriting" },
          },
          required: ["filename", "content"],
        },
      },
      {
        name: "read_note",
        description: "Read the contents of a previously saved note file",
        parameters: {
          type: "OBJECT",
          properties: { filename: { type: "STRING", description: "Filename to read" } },
          required: ["filename"],
        },
      },
      {
        name: "list_notes",
        description: "List all saved note files with their sizes and modification dates",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "delete_note",
        description: "Delete a saved note file",
        parameters: {
          type: "OBJECT",
          properties: { filename: { type: "STRING", description: "Filename to delete" } },
          required: ["filename"],
        },
      },
      {
        name: "get_datetime",
        description: "Get the current date and time",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "merge_notes",
        description: "Combine multiple note files into a single merged file",
        parameters: {
          type: "OBJECT",
          properties: {
            filenames: { type: "ARRAY", items: { type: "STRING" }, description: "List of filenames to merge" },
            output_filename: { type: "STRING", description: "Filename for the merged output" },
          },
          required: ["filenames", "output_filename"],
        },
      },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The Research Agent class
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class ResearchAgent {
  constructor() {
    this.model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      tools: toolDeclarations,
      systemInstruction: `
        You are a professional research assistant. Your job is to:
        1. Search for accurate information on topics using web_search
        2. Synthesize multiple sources into clear, comprehensive summaries
        3. Save important research to files when asked or when doing deep research
        4. Help users organize and retrieve their research notes
        5. Always search BEFORE answering questions about facts or current topics
        
        Research quality rules:
        - Search at least 2-3 different angles for complex topics
        - Distinguish between facts, trends, and opinions
        - Use descriptive filenames like "topic-keyword-date.md"
        - When saving notes, include a header with the research date
        
        Be concise in tool calls but thorough in final answers.
      `,
    });

    // Keep conversation history for multi-turn research sessions
    this.chat = this.model.startChat();
    this.stepCount = 0;
  }

  async run(message) {
    console.log(`\n${"═".repeat(65)}`);
    console.log(`👤 User: ${message}`);
    console.log(`${"═".repeat(65)}`);

    let response = await this.chat.sendMessage(message);
    this.stepCount = 0;

    while (this.stepCount < 15) {
      this.stepCount++;
      const parts = response.response.candidates[0].content.parts;
      const calls = parts.filter((p) => p.functionCall);

      // No more tool calls — return final answer
      if (!calls.length) {
        const text = parts.map((p) => p.text || "").join("");
        console.log(`\n🤖 Research Agent (${this.stepCount} steps):\n${text}`);
        return text;
      }

      // Execute all tool calls
      const toolResults = [];
      for (const p of calls) {
        const { name, args } = p.functionCall;
        console.log(`  🔍 Step ${this.stepCount}: ${name}(${JSON.stringify(args)})`);

        try {
          const fn = toolMap[name];
          if (!fn) throw new Error(`Unknown tool: ${name}`);
          const result = await Promise.resolve(fn(args));
          console.log(`  ✅ Done`);
          toolResults.push({ functionResponse: { name, response: result } });
        } catch (err) {
          console.log(`  ❌ Error: ${err.message}`);
          toolResults.push({ functionResponse: { name, response: { error: err.message } } });
        }
      }

      response = await this.chat.sendMessage(toolResults);
    }

    return "Max steps reached";
  }

  reset() {
    this.chat = this.model.startChat();
    this.stepCount = 0;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Run the research agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  const agent = new ResearchAgent();

  // Research and save
  await agent.run(
    "Research what Node.js is, its key features, and why developers love it. Save a good summary to 'nodejs-overview.md'"
  );

  // Use conversation memory — refers to previous research
  await agent.run("What notes do I have saved so far?");

  // Read back what was saved
  await agent.run("Read my nodejs-overview.md file and give me the key points");

  // Multi-topic research and merge
  await agent.run(
    "Search for information about Python and save notes as 'python-overview.md', then merge both nodejs and python notes into 'comparison.md'"
  );
}

main().catch(console.error);
