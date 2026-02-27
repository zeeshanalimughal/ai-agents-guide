// SKILLED AGENT: Customer Support with 3 Skills
// npm install @google/generative-ai
// GEMINI_API_KEY=your_key node examples/02_skilled_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FAKE DATABASE (replace with real DB in production)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const db = {
  orders: {
    "ORD-001": { status: "shipped", item: "iPhone Case", eta: "Feb 28", price: 25 },
    "ORD-002": { status: "processing", item: "Laptop Stand", eta: "Mar 2", price: 45 },
    "ORD-003": { status: "delivered", item: "USB Hub", eta: "delivered", price: 35 },
  },
  products: {
    "iphone-case": { name: "iPhone Case", price: 25, stock: 150, description: "Premium leather case, fits all iPhone models" },
    "laptop-stand": { name: "Laptop Stand", price: 45, stock: 30, description: "Adjustable aluminum stand, supports up to 17 inches" },
    "usb-hub": { name: "USB Hub", price: 35, stock: 75, description: "7-port USB 3.0 hub with power delivery" },
  },
  refunds: [],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SKILL 1: Order Tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const orderTrackingSkill = {
  name: "Order Tracking",
  instructions: `
    You are an order tracking specialist. When customers ask about their orders,
    use the track_order tool to get real-time status. Be empathetic and clear.
    If an order is delayed, apologize sincerely and offer alternatives.
    Always end with asking if there is anything else you can help with.
  `,
  tools: {
    track_order: ({ order_id }) => {
      const order = db.orders[order_id];
      if (!order) return { error: `Order ${order_id} not found. Please check the order ID.` };
      return order;
    },
    list_all_orders: () => {
      return Object.entries(db.orders).map(([id, o]) => ({ id, ...o }));
    },
  },
  toolDeclarations: [
    {
      name: "track_order",
      description: "Get the current status and details of an order by its ID",
      parameters: {
        type: "OBJECT",
        properties: {
          order_id: { type: "STRING", description: "The order ID like ORD-001" },
        },
        required: ["order_id"],
      },
    },
    {
      name: "list_all_orders",
      description: "List all orders in the system",
      parameters: { type: "OBJECT", properties: {} },
    },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SKILL 2: Refund Processing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const refundSkill = {
  name: "Refund Processing",
  instructions: `
    You handle refund requests professionally. Rules:
    - Only process refunds for delivered orders
    - Always verify the order exists before processing
    - Be empathetic and apologetic for any inconvenience
    - Tell customers refunds take 3-5 business days
    - If order is not delivered, explain why you cannot refund yet
  `,
  tools: {
    process_refund: ({ order_id, reason }) => {
      const order = db.orders[order_id];
      if (!order) return { success: false, error: "Order not found" };
      if (order.status !== "delivered") {
        return { success: false, error: `Cannot refund order with status "${order.status}". Order must be delivered first.` };
      }
      const refundId = `REF-${Date.now()}`;
      db.refunds.push({ refundId, order_id, reason, amount: order.price, date: new Date().toISOString() });
      return { success: true, refundId, amount: order.price, currency: "USD", eta: "3-5 business days" };
    },
    check_refund_status: ({ refund_id }) => {
      const refund = db.refunds.find((r) => r.refundId === refund_id);
      if (!refund) return { error: "Refund not found" };
      return { ...refund, status: "processing" };
    },
  },
  toolDeclarations: [
    {
      name: "process_refund",
      description: "Process a refund for a delivered order",
      parameters: {
        type: "OBJECT",
        properties: {
          order_id: { type: "STRING", description: "The order ID to refund" },
          reason: { type: "STRING", description: "Reason for the refund request" },
        },
        required: ["order_id", "reason"],
      },
    },
    {
      name: "check_refund_status",
      description: "Check the status of an existing refund",
      parameters: {
        type: "OBJECT",
        properties: {
          refund_id: { type: "STRING", description: "The refund ID like REF-123" },
        },
        required: ["refund_id"],
      },
    },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SKILL 3: Product Information
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const productSkill = {
  name: "Product Information",
  instructions: `
    You are a product expert and sales advisor.
    - Always mention price and current stock availability
    - Be enthusiastic but honest about products
    - Suggest related or complementary products when relevant
    - If stock is low (under 50), mention it to create urgency
  `,
  tools: {
    get_product: ({ product_id }) => {
      return db.products[product_id] || { error: "Product not found" };
    },
    search_products: ({ query }) => {
      return Object.entries(db.products)
        .filter(([id, p]) => 
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase())
        )
        .map(([id, p]) => ({ id, ...p }));
    },
    check_stock: ({ product_id }) => {
      const product = db.products[product_id];
      if (!product) return { error: "Product not found" };
      return { product_id, name: product.name, stock: product.stock, available: product.stock > 0 };
    },
  },
  toolDeclarations: [
    {
      name: "get_product",
      description: "Get full details about a specific product by ID",
      parameters: {
        type: "OBJECT",
        properties: {
          product_id: { type: "STRING", description: "Product ID like iphone-case, laptop-stand, usb-hub" },
        },
        required: ["product_id"],
      },
    },
    {
      name: "search_products",
      description: "Search for products by keyword or description",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Search term like 'laptop' or 'USB'" },
        },
        required: ["query"],
      },
    },
    {
      name: "check_stock",
      description: "Check how many units of a product are available",
      parameters: {
        type: "OBJECT",
        properties: {
          product_id: { type: "STRING", description: "Product ID to check stock for" },
        },
        required: ["product_id"],
      },
    },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENT FACTORY: Combine multiple skills into one agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createAgent(agentName, skills) {
  // Merge all skills' instructions into one system prompt
  const systemInstruction = `
    You are ${agentName}, a helpful customer support agent for TechStore.
    
    Your capabilities:
    ${skills.map((s) => `\n## ${s.name}\n${s.instructions}`).join("\n")}
    
    General rules:
    - Always be polite, empathetic, and efficient
    - Use tools to get real data before answering
    - If a customer's issue is outside your capabilities, say so honestly
    - End every interaction by asking if there's anything else you can help with
  `;

  // Merge all tool functions from all skills
  const allToolFns = skills.reduce((acc, skill) => ({ ...acc, ...skill.tools }), {});

  // Merge all tool declarations from all skills
  const allDeclarations = [{ functionDeclarations: skills.flatMap((s) => s.toolDeclarations) }];

  return { systemInstruction, allToolFns, allDeclarations };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Run the skilled agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runSkilledAgent(userMessage) {
  const { systemInstruction, allToolFns, allDeclarations } = createAgent("TechStore Support Bot", [
    orderTrackingSkill,
    refundSkill,
    productSkill,
  ]);

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction,
    tools: allDeclarations,
  });

  const chat = model.startChat();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`👤 Customer: ${userMessage}`);
  console.log(`${"─".repeat(60)}`);

  let response = await chat.sendMessage(userMessage);

  while (true) {
    const parts = response.response.candidates[0].content.parts;
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts.map((p) => p.text || "").join("");
      console.log(`\n🤖 Support Agent:\n${text}`);
      return text;
    }

    const toolResults = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      console.log(`  🔧 Using skill tool: ${name}(${JSON.stringify(args)})`);

      const result = allToolFns[name](args);
      console.log(`  ✅ Result: ${JSON.stringify(result)}`);

      toolResults.push({ functionResponse: { name, response: result } });
    }

    response = await chat.sendMessage(toolResults);
  }
}

// Test all 3 skills
async function main() {
  // Test Order Tracking Skill
  await runSkilledAgent("Where is my order ORD-001? When will it arrive?");

  // Test Refund Skill
  await runSkilledAgent("I want a refund for order ORD-003. The USB hub stopped working after 2 days.");

  // Test trying to refund a non-delivered order
  await runSkilledAgent("Can I get a refund for ORD-002?");

  // Test Product Skill
  await runSkilledAgent("Do you have any laptop accessories? What's available?");
}

main().catch(console.error);
