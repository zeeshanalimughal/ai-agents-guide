// ORCHESTRATOR PATTERN — One coordinator + multiple specialist agents running in parallel
// npm install @google/generative-ai
// GEMINI_API_KEY=your_key node examples/07_orchestrator_pattern.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WORKER AGENTS (each is a specialized mini-agent)
// These are simple — just a system prompt makes them experts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function callWorker(workerName, task, systemPrompt) {
  const start = Date.now();
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(task);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ✅ ${workerName} done in ${elapsed}s`);
  return result.response.text();
}

const workers = {
  code_agent: (task) =>
    callWorker(
      "Code Agent",
      task,
      `You are a senior software engineer specializing in Node.js, JavaScript, and modern web technologies.
       Write clean, production-quality code with:
       - Clear comments explaining the why, not the what
       - Proper error handling
       - Example usage at the bottom
       - Any important notes or caveats
       Format: code block first, then brief explanation`
    ),

  analysis_agent: (task) =>
    callWorker(
      "Analysis Agent",
      task,
      `You are a senior data analyst and business intelligence expert.
       For analysis tasks:
       - Identify key patterns and insights
       - Use specific numbers and percentages when possible
       - Structure findings as: Summary → Key Findings → Recommendations
       - Flag any assumptions or data limitations
       Be precise and data-driven.`
    ),

  writing_agent: (task) =>
    callWorker(
      "Writing Agent",
      task,
      `You are a senior technical writer and content strategist.
       Write content that is:
       - Clear and jargon-free (unless technical audience specified)
       - Well-structured with logical flow
       - Engaging without being fluffy
       - Appropriately concise
       Match the tone to the audience (technical, business, consumer).`
    ),

  math_agent: (task) =>
    callWorker(
      "Math Agent",
      task,
      `You are an expert mathematician and statistician.
       For all calculations:
       - Show every step clearly
       - Explain the formula/method used
       - Verify the result with a sanity check
       - Present results with appropriate precision
       - Flag any edge cases or assumptions`
    ),

  security_agent: (task) =>
    callWorker(
      "Security Agent",
      task,
      `You are a senior cybersecurity expert and ethical hacker.
       For security reviews:
       - List vulnerabilities by severity (Critical/High/Medium/Low)
       - Explain why each is a risk
       - Provide specific fix recommendations
       - Reference OWASP or CVEs where relevant
       Be thorough and practical.`
    ),

  ux_agent: (task) =>
    callWorker(
      "UX Agent",
      task,
      `You are a senior UX designer and product strategist.
       Focus on:
       - User needs and pain points
       - Usability best practices
       - Accessibility considerations
       - Concrete actionable improvements
       Think from the user's perspective first.`
    ),
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ORCHESTRATOR AGENT
// Has ONE tool: call_worker — to delegate to specialist agents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class Orchestrator {
  constructor() {
    this.model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      tools: [
        {
          functionDeclarations: [
            {
              name: "call_worker",
              description: "Delegate a specific subtask to a specialized worker agent. Call multiple workers simultaneously for parallel execution.",
              parameters: {
                type: "OBJECT",
                properties: {
                  worker: {
                    type: "STRING",
                    enum: ["code_agent", "analysis_agent", "writing_agent", "math_agent", "security_agent", "ux_agent"],
                    description: "Which specialized agent to use for this subtask",
                  },
                  task: {
                    type: "STRING",
                    description: "Detailed description of the specific task for this worker. Be specific and comprehensive.",
                  },
                },
                required: ["worker", "task"],
              },
            },
          ],
        },
      ],
      systemInstruction: `
        You are an expert orchestrator AI that breaks down complex tasks and delegates to specialists.
        
        Available specialists:
        - code_agent: Writing code, debugging, architecture, algorithms
        - analysis_agent: Data analysis, requirements analysis, pattern finding, research synthesis
        - writing_agent: Documentation, articles, emails, user-facing content
        - math_agent: Calculations, statistics, formulas, financial modeling
        - security_agent: Security reviews, vulnerability analysis, best practices
        - ux_agent: User experience design, accessibility, interface improvements
        
        Strategy:
        1. Analyze the user request carefully
        2. Break it into distinct subtasks
        3. Match each subtask to the RIGHT specialist
        4. Call multiple workers IN PARALLEL when tasks are independent (most of the time)
        5. Combine all results into a cohesive, well-organized final answer
        
        Important: ALWAYS delegate to workers — don't answer directly yourself.
        Call multiple workers simultaneously to save time.
      `,
    });
  }

  async run(userRequest) {
    console.log(`\n${"═".repeat(65)}`);
    console.log(`🎯 ORCHESTRATOR: "${userRequest.trim().substring(0, 80)}..."`);
    console.log(`${"═".repeat(65)}`);

    const chat = this.model.startChat();
    let response = await chat.sendMessage(userRequest);
    let iteration = 0;
    const allWorkerResults = [];

    while (iteration++ < 5) {
      const parts = response.response.candidates[0].content.parts;
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        const finalAnswer = parts.map((p) => p.text || "").join("");
        console.log(`\n${"═".repeat(65)}`);
        console.log(`🏆 ORCHESTRATED RESULT:\n`);
        console.log(finalAnswer);
        return finalAnswer;
      }

      // Run ALL worker calls in PARALLEL for speed
      console.log(`\n📋 Dispatching ${calls.length} specialist(s) in parallel...`);
      const startTime = Date.now();

      const workerPromises = calls.map(async (p) => {
        const { worker, task } = p.functionCall.args;
        console.log(`  🤖 → ${worker}: "${task.substring(0, 55)}..."`);

        const workerFn = workers[worker];
        if (!workerFn) {
          return { name: "call_worker", response: { worker, error: `Unknown worker: ${worker}` } };
        }

        const result = await workerFn(task);
        allWorkerResults.push({ worker, task, result });
        return { name: "call_worker", response: { worker, result } };
      });

      const results = await Promise.all(workerPromises);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ⏱️  All workers completed in ${elapsed}s (parallel)`);

      const toolResults = results.map((r) => ({
        functionResponse: { name: r.name, response: r.response },
      }));

      response = await chat.sendMessage(toolResults);
    }

    return "Orchestration complete";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test with real complex requests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  const orchestrator = new Orchestrator();

  // Example 1: Multi-disciplinary request
  await orchestrator.run(`
    I'm building a user authentication system for a Node.js web app. Please:
    1. Write the actual Express.js + JWT authentication code (login, register, middleware)
    2. Do a security review of what vulnerabilities I should watch out for
    3. Write developer documentation for the auth API endpoints
    4. Calculate: if I have 10,000 users and each session token is 256 bytes, what's the memory impact at 30% concurrent users?
  `);

  console.log("\n\n");

  // Example 2: Product design request
  await orchestrator.run(`
    I want to build a mobile app for tracking daily water intake. Please:
    1. Analyze what features users actually need and prioritize them
    2. Review UX best practices for health tracking apps
    3. Write marketing copy for the app store description
    4. Calculate: if a user drinks 8 glasses of 250ml each, what percentage of the recommended 2.7L daily intake is that?
  `);
}

main().catch(console.error);
