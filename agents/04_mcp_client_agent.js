// MCP CLIENT AGENT — Connects to MCP server, auto-discovers tools, uses them
// npm install @google/generative-ai @modelcontextprotocol/sdk
// GEMINI_API_KEY=your_key node examples/04_mcp_client_agent.js
//
// This agent:
// 1. Launches the MCP server as a subprocess
// 2. Discovers all available tools automatically
// 3. Converts MCP tool format to Gemini format
// 4. Runs the agent loop, dispatching calls to the MCP server

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: Convert MCP JSON Schema types to Gemini types
// MCP uses lowercase "string", "number" — Gemini uses uppercase "STRING", "NUMBER"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function convertSchemaToGemini(schema) {
  if (!schema) return { type: "OBJECT", properties: {} };

  const convert = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "type" && typeof value === "string") {
        result[key] = value.toUpperCase();
      } else if (typeof value === "object" && value !== null) {
        result[key] = convert(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  return convert(schema);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: Connect to MCP server + run agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  // STEP 1: Connect to our MCP server (launches it as a subprocess)
  console.log("🔌 Connecting to MCP server...");
  const mcpClient = new Client({ name: "gemini-mcp-agent", version: "1.0.0" }, {});
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "03_mcp_server.js")],
  });

  await mcpClient.connect(transport);
  console.log("✅ Connected to MCP server!\n");

  // STEP 2: Discover tools automatically — we don't hardcode them!
  const { tools: mcpTools } = await mcpClient.listTools();
  console.log(`🔍 Discovered ${mcpTools.length} tools from MCP server:`);
  mcpTools.forEach((t) => console.log(`   - ${t.name}: ${t.description}`));
  console.log();

  // STEP 3: Convert MCP tool format → Gemini tool format
  const geminiTools = [
    {
      functionDeclarations: mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: convertSchemaToGemini(tool.inputSchema),
      })),
    },
  ];

  // STEP 4: Also discover resources
  const { resources } = await mcpClient.listResources();
  console.log(`📦 Discovered ${resources.length} resources from MCP server:`);
  resources.forEach((r) => console.log(`   - ${r.uri}: ${r.name}`));
  console.log();

  // STEP 5: Create Gemini model with discovered MCP tools
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: geminiTools,
    systemInstruction: `
      You are a helpful assistant connected to an MCP server with todo management and file system tools.
      
      You can:
      - Manage todos (add, list, complete, delete, update)
      - Read and write files
      - List directory contents
      
      Always use tools to get real data. Be concise and helpful.
    `,
  });

  // STEP 6: Agent loop — dispatches tool calls to the MCP server
  async function runAgent(userMessage) {
    console.log(`${"─".repeat(60)}`);
    console.log(`👤 User: ${userMessage}`);
    console.log(`${"─".repeat(60)}`);

    const chat = model.startChat();
    let response = await chat.sendMessage(userMessage);

    while (true) {
      const parts = response.response.candidates[0].content.parts;
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        const text = parts.map((p) => p.text || "").join("");
        console.log(`\n🤖 Agent: ${text}\n`);
        return text;
      }

      const toolResults = [];
      for (const p of calls) {
        const { name, args } = p.functionCall;
        console.log(`  📡 MCP call → ${name}(${JSON.stringify(args)})`);

        // Execute the tool ON the MCP server (not locally!)
        const mcpResult = await mcpClient.callTool({ name, arguments: args });
        const resultText = mcpResult.content.map((c) => c.text).join("\n");
        console.log(`  ✅ MCP result: ${resultText}`);

        toolResults.push({
          functionResponse: {
            name,
            response: { result: resultText },
          },
        });
      }

      response = await chat.sendMessage(toolResults);
    }
  }

  // Test the agent with real requests
  await runAgent("Show me all my pending todos");
  await runAgent("Add a high priority todo: Review the AI agents guide before Friday");
  await runAgent("Complete todo number 1, then show me all todos again");
  await runAgent("Write a file called 'my-todos.txt' with a summary of all my todos");

  // Cleanup
  await mcpClient.close();
  console.log("\n👋 Disconnected from MCP server");
}

main().catch(console.error);
