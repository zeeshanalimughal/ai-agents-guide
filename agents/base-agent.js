// BASE AGENT — Reusable agent class. Extend this for any specialized agent.
// npm install @google/generative-ai
//
// Usage:
//   const { BaseAgent } = require('./base-agent');
//   class MyAgent extends BaseAgent { ... }

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BaseAgent — The core reusable agent loop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class BaseAgent {
  /**
   * @param {Object} config
   * @param {string} config.name - Agent name for logging
   * @param {string} config.systemPrompt - System instruction for the agent
   * @param {Array} config.tools - Array of Gemini function declarations
   * @param {Object} config.toolFns - Map of tool name → async function
   * @param {string} [config.model] - Gemini model name (default: gemini-1.5-flash)
   * @param {number} [config.maxSteps] - Max tool call iterations (default: 20)
   * @param {boolean} [config.verbose] - Log tool calls (default: true)
   */
  constructor({
    name,
    systemPrompt,
    tools = [],
    toolFns = {},
    model = "gemini-1.5-flash",
    maxSteps = 20,
    verbose = true,
  }) {
    this.name = name;
    this.toolFns = toolFns;
    this.maxSteps = maxSteps;
    this.verbose = verbose;
    this.stepCount = 0;
    this.totalCalls = 0;

    this.geminiModel = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
      tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
    });

    // Start with fresh conversation
    this.chat = this.geminiModel.startChat();
  }

  log(msg) {
    if (this.verbose) console.log(`[${this.name}] ${msg}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // run() — Main entry point. Send a message and get a response.
  // Handles the full tool-calling loop automatically.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async run(userMessage, context = null) {
    this.log(`👤 "${userMessage}"`);
    const startTime = Date.now();
    this.stepCount = 0;

    // Optionally inject extra context
    const fullMessage = context
      ? `${userMessage}\n\n[Context]:\n${typeof context === "object" ? JSON.stringify(context, null, 2) : context}`
      : userMessage;

    let response = await this.chat.sendMessage(fullMessage);

    while (this.stepCount < this.maxSteps) {
      this.stepCount++;
      const parts = response.response.candidates[0].content.parts;
      const calls = parts.filter((p) => p.functionCall);

      // No more tool calls — we have the final answer
      if (!calls.length) {
        const text = parts.map((p) => p.text || "").join("");
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        this.log(`✅ Done in ${this.stepCount} steps, ${elapsed}s`);
        return {
          success: true,
          response: text,
          steps: this.stepCount,
          elapsed,
        };
      }

      // Execute all tool calls in this round
      const toolResults = [];
      for (const p of calls) {
        const { name, args } = p.functionCall;
        this.log(`🔧 Step ${this.stepCount}: ${name}(${JSON.stringify(args)})`);
        this.totalCalls++;

        try {
          const fn = this.toolFns[name];
          if (!fn) throw new Error(`Unknown tool: "${name}". Available: ${Object.keys(this.toolFns).join(", ")}`);

          const result = await Promise.resolve(fn(args));
          toolResults.push({ functionResponse: { name, response: result } });
        } catch (err) {
          this.log(`❌ Tool error: ${err.message}`);
          toolResults.push({
            functionResponse: { name, response: { error: err.message, tool: name } },
          });
        }
      }

      // Send results back to the AI
      response = await this.chat.sendMessage(toolResults);
    }

    return {
      success: false,
      error: `Max steps (${this.maxSteps}) reached`,
      steps: this.stepCount,
    };
  }

  // Reset conversation history (start fresh)
  reset() {
    this.chat = this.geminiModel.startChat();
    this.stepCount = 0;
    this.log("🔄 Reset — new conversation started");
  }

  // Get stats
  getStats() {
    return { totalCalls: this.totalCalls, lastSteps: this.stepCount };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXAMPLE 1: Weather Agent (extends BaseAgent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class WeatherAgent extends BaseAgent {
  constructor() {
    super({
      name: "WeatherAgent",
      systemPrompt: `
        You are a helpful weather assistant. When asked about weather:
        1. Get current conditions using get_weather
        2. Get the forecast using get_forecast
        3. Give practical advice (what to wear, activities to avoid/enjoy)
      `,
      tools: [
        {
          name: "get_weather",
          description: "Get current weather conditions for a city",
          parameters: {
            type: "OBJECT",
            properties: {
              city: { type: "STRING", description: "City name" },
              country: { type: "STRING", description: "Country code (optional, like PK, US, UK)" },
            },
            required: ["city"],
          },
        },
        {
          name: "get_forecast",
          description: "Get 3-day weather forecast for a city",
          parameters: {
            type: "OBJECT",
            properties: { city: { type: "STRING", description: "City name" } },
            required: ["city"],
          },
        },
      ],
      toolFns: {
        get_weather: ({ city, country }) => ({
          city: country ? `${city}, ${country}` : city,
          temperature: 28,
          feelsLike: 31,
          condition: "Sunny with light haze",
          humidity: "65%",
          windSpeed: "15 km/h",
          windDirection: "SW",
          uvIndex: 7,
          visibility: "10 km",
        }),
        get_forecast: ({ city }) => ({
          city,
          forecast: [
            { day: "Today", high: 30, low: 22, condition: "Sunny" },
            { day: "Tomorrow", high: 28, low: 20, condition: "Partly cloudy" },
            { day: "Day after", high: 25, low: 19, condition: "Chance of rain" },
          ],
        }),
      },
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXAMPLE 2: Currency Converter Agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class CurrencyAgent extends BaseAgent {
  constructor() {
    // Mock exchange rates (in production, fetch from a real API)
    const rates = { USD: 1, PKR: 278.5, EUR: 0.92, GBP: 0.79, AED: 3.67, SAR: 3.75 };

    super({
      name: "CurrencyAgent",
      systemPrompt: `
        You are a currency conversion assistant.
        Use get_rate to fetch exchange rates and convert_currency to do conversions.
        Always show the rate used and the converted amount clearly.
        For large amounts, also show the amount in words.
      `,
      tools: [
        {
          name: "get_rate",
          description: "Get the exchange rate between two currencies",
          parameters: {
            type: "OBJECT",
            properties: {
              from: { type: "STRING", description: "Source currency code like USD, PKR, EUR" },
              to: { type: "STRING", description: "Target currency code" },
            },
            required: ["from", "to"],
          },
        },
        {
          name: "convert_currency",
          description: "Convert an amount from one currency to another",
          parameters: {
            type: "OBJECT",
            properties: {
              amount: { type: "NUMBER", description: "Amount to convert" },
              from: { type: "STRING", description: "Source currency code" },
              to: { type: "STRING", description: "Target currency code" },
            },
            required: ["amount", "from", "to"],
          },
        },
      ],
      toolFns: {
        get_rate: ({ from, to }) => {
          const fromRate = rates[from.toUpperCase()];
          const toRate = rates[to.toUpperCase()];
          if (!fromRate || !toRate) return { error: `Unknown currency. Available: ${Object.keys(rates).join(", ")}` };
          const rate = toRate / fromRate;
          return { from, to, rate: Math.round(rate * 10000) / 10000, source: "Mock rates (not live)" };
        },
        convert_currency: ({ amount, from, to }) => {
          const fromRate = rates[from.toUpperCase()];
          const toRate = rates[to.toUpperCase()];
          if (!fromRate || !toRate) return { error: "Unknown currency" };
          const result = (amount * toRate) / fromRate;
          return {
            original: { amount, currency: from },
            converted: { amount: Math.round(result * 100) / 100, currency: to },
            rate: Math.round((toRate / fromRate) * 10000) / 10000,
          };
        },
      },
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXAMPLE 3: Unit Converter Agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class UnitConverterAgent extends BaseAgent {
  constructor() {
    super({
      name: "UnitConverter",
      systemPrompt: "You are a unit conversion expert. Always show the formula and result clearly.",
      tools: [
        {
          name: "convert",
          description: "Convert a value between units",
          parameters: {
            type: "OBJECT",
            properties: {
              value: { type: "NUMBER", description: "Value to convert" },
              from: { type: "STRING", description: "Source unit (e.g., km, miles, kg, lbs, celsius, fahrenheit)" },
              to: { type: "STRING", description: "Target unit" },
            },
            required: ["value", "from", "to"],
          },
        },
      ],
      toolFns: {
        convert: ({ value, from, to }) => {
          const conversions = {
            "km-miles": (v) => v * 0.621371,
            "miles-km": (v) => v * 1.60934,
            "kg-lbs": (v) => v * 2.20462,
            "lbs-kg": (v) => v * 0.453592,
            "celsius-fahrenheit": (v) => (v * 9) / 5 + 32,
            "fahrenheit-celsius": (v) => ((v - 32) * 5) / 9,
            "meters-feet": (v) => v * 3.28084,
            "feet-meters": (v) => v * 0.3048,
            "liters-gallons": (v) => v * 0.264172,
            "gallons-liters": (v) => v * 3.78541,
          };

          const key = `${from.toLowerCase()}-${to.toLowerCase()}`;
          const fn = conversions[key];
          if (!fn) return { error: `Conversion "${from}" to "${to}" not supported`, available: Object.keys(conversions) };

          const result = Math.round(fn(value) * 100000) / 100000;
          return { input: { value, unit: from }, output: { value: result, unit: to } };
        },
      },
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Export and test
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
module.exports = { BaseAgent, WeatherAgent, CurrencyAgent, UnitConverterAgent };

async function main() {
  console.log("=== TESTING BASE AGENT PATTERN ===\n");

  // Test WeatherAgent
  const weatherAgent = new WeatherAgent();
  const w = await weatherAgent.run("What's the weather like in Lahore right now? Should I go for a walk?");
  console.log(w.response);

  // Test CurrencyAgent
  const currencyAgent = new CurrencyAgent();
  const c = await currencyAgent.run("Convert 5000 PKR to USD and EUR. Which gives me more?");
  console.log(c.response);

  // Test UnitConverterAgent — multi-turn (uses conversation memory)
  const unitAgent = new UnitConverterAgent();
  await unitAgent.run("Convert 100 km to miles");
  await unitAgent.run("Now convert 75 kg to lbs and 37 celsius to fahrenheit"); // Uses same chat session
}

main().catch(console.error);
