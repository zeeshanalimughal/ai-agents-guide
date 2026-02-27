// INVENTORY MANAGER AGENT — Skills: Stock Tracking + Low-Stock Alerts + Reorder Management
// Real-world e-commerce inventory agent
// GEMINI_API_KEY=your_key node 16_inventory_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Inventory database ────────────────────────────────────────────────────────
const inventory = [
  { sku: "SKU-001", name: "Wireless Earbuds",  stock: 8,   minStock: 15, unitCost: 22, sellPrice: 59, supplier: "TechSupplies Co", leadDays: 7  },
  { sku: "SKU-002", name: "Phone Stand",        stock: 45,  minStock: 20, unitCost: 5,  sellPrice: 18, supplier: "GadgetWorld",    leadDays: 5  },
  { sku: "SKU-003", name: "USB-C Cable 2m",     stock: 3,   minStock: 30, unitCost: 3,  sellPrice: 12, supplier: "CableKing",      leadDays: 3  },
  { sku: "SKU-004", name: "Laptop Sleeve 15\"", stock: 22,  minStock: 10, unitCost: 12, sellPrice: 35, supplier: "BagSuppliers",   leadDays: 10 },
  { sku: "SKU-005", name: "Webcam 1080p",       stock: 0,   minStock: 10, unitCost: 28, sellPrice: 79, supplier: "TechSupplies Co", leadDays: 7  },
  { sku: "SKU-006", name: "Mouse Pad XL",       stock: 60,  minStock: 25, unitCost: 6,  sellPrice: 20, supplier: "GadgetWorld",    leadDays: 5  },
];

const purchaseOrders = [];

// ── SKILL 1: Stock Tracking ───────────────────────────────────────────────────
const stockSkill = {
  instructions: "View stock levels, search products, and update inventory after sales.",
  tools: {
    get_all_stock: ({ filter }) => {
      if (filter === "low")     return inventory.filter((i) => i.stock <= i.minStock && i.stock > 0);
      if (filter === "out")     return inventory.filter((i) => i.stock === 0);
      if (filter === "healthy") return inventory.filter((i) => i.stock > i.minStock);
      return inventory;
    },
    get_product: ({ sku }) => inventory.find((i) => i.sku === sku) || { error: `SKU ${sku} not found` },
    update_stock: ({ sku, quantity, reason }) => {
      const item = inventory.find((i) => i.sku === sku);
      if (!item) return { error: "Product not found" };
      const before = item.stock;
      item.stock += quantity;
      return { sku, name: item.name, before, after: item.stock,
        change: quantity > 0 ? `+${quantity}` : `${quantity}`, reason };
    },
  },
  declarations: [
    { name: "get_all_stock",
      description: "Get all inventory items. Filter: 'low' (below min), 'out' (zero stock), 'healthy', or 'all'",
      parameters: { type: "OBJECT",
        properties: { filter: { type: "STRING", enum: ["all", "low", "out", "healthy"] } } } },
    { name: "get_product", description: "Get details for a specific product by SKU",
      parameters: { type: "OBJECT",
        properties: { sku: { type: "STRING", description: "Product SKU like SKU-001" } },
        required: ["sku"] } },
    { name: "update_stock",
      description: "Update stock quantity (positive to add, negative to subtract after sale)",
      parameters: { type: "OBJECT",
        properties: {
          sku:      { type: "STRING" },
          quantity: { type: "NUMBER", description: "Positive to add stock, negative to remove" },
          reason:   { type: "STRING", description: "Reason: sale, return, damage, restock" },
        },
        required: ["sku", "quantity", "reason"] } },
  ],
};

// ── SKILL 2: Alerts & Analysis ───────────────────────────────────────────────
const alertSkill = {
  instructions: "Generate alerts for low stock and analyze inventory health.",
  tools: {
    get_alerts: () => {
      const out  = inventory.filter((i) => i.stock === 0);
      const low  = inventory.filter((i) => i.stock > 0 && i.stock <= i.minStock);
      const revenue = inventory.reduce((sum, i) => sum + i.stock * i.sellPrice, 0);
      const cost    = inventory.reduce((sum, i) => sum + i.stock * i.unitCost, 0);
      return {
        outOfStock: out.map((i) => ({ sku: i.sku, name: i.name, missedRevenue: `$${i.minStock * i.sellPrice} potential` })),
        lowStock:   low.map((i) => ({ sku: i.sku, name: i.name, stock: i.stock, minStock: i.minStock, daysLeft: Math.floor(i.stock / 2) })),
        inventoryValue: { atCost: `$${cost.toFixed(0)}`, atRetail: `$${revenue.toFixed(0)}`, margin: `${(((revenue - cost) / revenue) * 100).toFixed(1)}%` },
      };
    },
  },
  declarations: [
    { name: "get_alerts",
      description: "Get all low-stock and out-of-stock alerts plus inventory value summary",
      parameters: { type: "OBJECT", properties: {} } },
  ],
};

// ── SKILL 3: Purchase Orders ──────────────────────────────────────────────────
const reorderSkill = {
  instructions: "Create and manage purchase orders to restock inventory from suppliers.",
  tools: {
    create_purchase_order: ({ sku, quantity }) => {
      const item = inventory.find((i) => i.sku === sku);
      if (!item) return { error: "Product not found" };
      const order = {
        poNumber:  `PO-${String(purchaseOrders.length + 1).padStart(3, "0")}`,
        sku:       item.sku, product: item.name,
        quantity,
        unitCost:  item.unitCost, totalCost: quantity * item.unitCost,
        supplier:  item.supplier,
        eta:       `${item.leadDays} business days`,
        status:    "sent",
        createdAt: new Date().toISOString().split("T")[0],
      };
      purchaseOrders.push(order);
      return { success: true, order };
    },
    auto_reorder_low_stock: () => {
      const toReorder = inventory.filter((i) => i.stock <= i.minStock);
      const orders = toReorder.map((item) => {
        const qty = item.minStock * 2 - item.stock; // reorder up to 2x minimum
        const order = {
          poNumber:  `PO-${String(purchaseOrders.length + purchaseOrders.length + 1).padStart(3, "0")}`,
          sku: item.sku, product: item.name, quantity: qty,
          totalCost: qty * item.unitCost, supplier: item.supplier,
          eta: `${item.leadDays} business days`, status: "sent",
        };
        purchaseOrders.push(order);
        return order;
      });
      return { ordersCreated: orders.length, orders, totalSpend: `$${orders.reduce((s, o) => s + o.totalCost, 0)}` };
    },
    list_purchase_orders: () =>
      purchaseOrders.length ? purchaseOrders : { message: "No purchase orders yet" },
  },
  declarations: [
    { name: "create_purchase_order", description: "Create a purchase order to restock a product",
      parameters: { type: "OBJECT",
        properties: {
          sku:      { type: "STRING" },
          quantity: { type: "NUMBER", description: "Units to order" },
        },
        required: ["sku", "quantity"] } },
    { name: "auto_reorder_low_stock",
      description: "Automatically create purchase orders for all low-stock and out-of-stock items",
      parameters: { type: "OBJECT", properties: {} } },
    { name: "list_purchase_orders", description: "List all created purchase orders",
      parameters: { type: "OBJECT", properties: {} } },
  ],
};

// ── Build & run ───────────────────────────────────────────────────────────────
const allSkills = [stockSkill, alertSkill, reorderSkill];
const toolFns = Object.assign({}, ...allSkills.map((s) => s.tools));
const tools = [{ functionDeclarations: allSkills.flatMap((s) => s.declarations) }];

async function inventoryAgent(request) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", tools,
    systemInstruction: `You are an inventory manager for an e-commerce store. 
      Use your skills to track stock, generate alerts, and manage reorders.
      Always prioritize out-of-stock items first. Give specific SKUs and numbers.`,
  });

  const chat = model.startChat();
  console.log(`\n📦 Request: ${request}`);
  console.log("─".repeat(55));

  let resp = await chat.sendMessage(request);
  while (true) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) { console.log("\n🤖 Inventory Agent:\n" + parts.map((p) => p.text || "").join("")); return; }
    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      console.log(`  🔧 ${name}(${JSON.stringify(args)})`);
      return { functionResponse: { name, response: toolFns[name](args) } };
    });
    resp = await chat.sendMessage(results);
  }
}

async function main() {
  await inventoryAgent("Give me a full inventory health report — what needs urgent attention?");
  await inventoryAgent("Automatically reorder everything that's running low or out of stock");
  await inventoryAgent("We just sold 5 units of SKU-002 and received a return of 2 units of SKU-001. Update the stock.");
}

main().catch(console.error);
