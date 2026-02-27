// npm install @google/generative-ai
// GEMINI_API_KEY=your_key node 01_calculator_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// STEP 1: Actual JavaScript functions (your tools)
const tools = {
  add: ({ a, b }) => a + b,
  subtract: ({ a, b }) => a - b,
  multiply: ({ a, b }) => a * b,
  divide: ({ a, b }) => (b === 0 ? "Error: Cannot divide by zero" : a / b),
  power: ({ base, exponent }) => Math.pow(base, exponent),
};

// STEP 2: Describe tools to the AI in its expected format
const toolDeclarations = [
  {
    functionDeclarations: [
      {
        name: "add",
        description: "Add two numbers together",
        parameters: {
          type: "OBJECT",
          properties: {
            a: { type: "NUMBER", description: "First number" },
            b: { type: "NUMBER", description: "Second number" },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "subtract",
        description: "Subtract b from a",
        parameters: {
          type: "OBJECT",
          properties: {
            a: { type: "NUMBER", description: "First number" },
            b: { type: "NUMBER", description: "Number to subtract" },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "multiply",
        description: "Multiply two numbers",
        parameters: {
          type: "OBJECT",
          properties: {
            a: { type: "NUMBER", description: "First number" },
            b: { type: "NUMBER", description: "Second number" },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "divide",
        description: "Divide number a by number b",
        parameters: {
          type: "OBJECT",
          properties: {
            a: { type: "NUMBER", description: "Dividend" },
            b: { type: "NUMBER", description: "Divisor" },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "power",
        description: "Raise base to the power of exponent",
        parameters: {
          type: "OBJECT",
          properties: {
            base: { type: "NUMBER", description: "The base number" },
            exponent: { type: "NUMBER", description: "The exponent" },
          },
          required: ["base", "exponent"],
        },
      },
    ],
  },
];

// STEP 3: The Agent Loop
async function runAgent(userMessage) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: toolDeclarations,
  });

  const chat = model.startChat();
  console.log(`\n${"─".repeat(60)}`);
  console.log(`👤 User: ${userMessage}`);
  console.log(`${"─".repeat(60)}`);

  let response = await chat.sendMessage(userMessage);

  // The Agent Loop — keeps running until no more tool calls
  while (true) {
    const candidate = response.response.candidates[0];
    const parts = candidate.content.parts;
    const functionCalls = parts.filter((p) => p.functionCall);

    // If no function calls, we're done
    if (functionCalls.length === 0) {
      const text = parts.map((p) => p.text || "").join("");
      console.log(`\n🤖 Agent Answer: ${text}`);
      return text;
    }

    // Execute each tool call
    const toolResults = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      console.log(`  🔧 Tool call: ${name}(${JSON.stringify(args)})`);

      const toolFn = tools[name];
      if (!toolFn) throw new Error(`Unknown tool: ${name}`);

      const result = toolFn(args);
      console.log(`  ✅ Result: ${result}`);

      toolResults.push({
        functionResponse: {
          name: name,
          response: { result },
        },
      });
    }

    // Send tool results back to the AI
    response = await chat.sendMessage(toolResults);
  }
}

async function main() {
  await runAgent("What is 15 + 27?");
  await runAgent("What is (5 + 3) * 4, and then divide that by 2^3?");
  await runAgent("If I have 100 items and give away 35, then triple what's left, how many do I have?");
}

main().catch(console.error);
