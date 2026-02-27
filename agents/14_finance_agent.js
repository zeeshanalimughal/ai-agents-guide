// PERSONAL FINANCE AGENT — Skills: Expense Tracking + Budget Analysis + Savings Goals
// Tracks your money, analyzes spending, and suggests savings plans
// GEMINI_API_KEY=your_key node 14_finance_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── In-memory ledger (in production: SQLite or MongoDB) ───────────────────────
const ledger = {
  expenses: [
    { id: 1, desc: "Groceries",     amount: 85,   category: "Food",      date: "2024-02-01" },
    { id: 2, desc: "Uber",          amount: 12,   category: "Transport", date: "2024-02-02" },
    { id: 3, desc: "Netflix",       amount: 15,   category: "Subscriptions", date: "2024-02-03" },
    { id: 4, desc: "Restaurant",    amount: 45,   category: "Food",      date: "2024-02-05" },
    { id: 5, desc: "Electricity",   amount: 90,   category: "Utilities", date: "2024-02-07" },
    { id: 6, desc: "Gym",           amount: 30,   category: "Health",    date: "2024-02-08" },
    { id: 7, desc: "Groceries",     amount: 70,   category: "Food",      date: "2024-02-10" },
    { id: 8, desc: "Online course", amount: 29,   category: "Education", date: "2024-02-12" },
    { id: 9, desc: "Dinner out",    amount: 60,   category: "Food",      date: "2024-02-15" },
    { id: 10, desc: "Internet",     amount: 35,   category: "Utilities", date: "2024-02-17" },
  ],
  income: 3000, // monthly
  budget: { Food: 200, Transport: 80, Subscriptions: 50, Utilities: 150, Health: 60, Education: 50 },
  savingsGoals: [
    { id: 1, name: "Emergency Fund", target: 5000, saved: 1200 },
    { id: 2, name: "Laptop",         target: 1500, saved: 400  },
  ],
};
let nextExpenseId = 11;

// ── SKILL 1: Expense Tracking ─────────────────────────────────────────────────
const expenseSkill = {
  instructions: "Add, view, and categorize expenses. Help users log their spending.",
  tools: {
    add_expense: ({ desc, amount, category, date }) => {
      const expense = { id: nextExpenseId++, desc, amount, category, date: date || new Date().toISOString().split("T")[0] };
      ledger.expenses.push(expense);
      return { success: true, expense, message: `Added $${amount} for ${desc}` };
    },
    list_expenses: ({ category, limit = 20 }) => {
      let list = ledger.expenses;
      if (category) list = list.filter((e) => e.category.toLowerCase() === category.toLowerCase());
      return list.slice(-limit).sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    get_spending_by_category: () => {
      const totals = {};
      ledger.expenses.forEach((e) => {
        totals[e.category] = (totals[e.category] || 0) + e.amount;
      });
      return Object.entries(totals)
        .map(([category, total]) => ({ category, total, budget: ledger.budget[category] || "No budget set" }))
        .sort((a, b) => b.total - a.total);
    },
  },
  declarations: [
    { name: "add_expense", description: "Add a new expense to the ledger",
      parameters: { type: "OBJECT",
        properties: {
          desc:     { type: "STRING", description: "What you spent on" },
          amount:   { type: "NUMBER", description: "Amount in USD" },
          category: { type: "STRING", description: "Category: Food, Transport, Utilities, Health, Education, Entertainment, etc." },
          date:     { type: "STRING", description: "Date in YYYY-MM-DD format (optional, defaults to today)" },
        },
        required: ["desc", "amount", "category"] } },
    { name: "list_expenses", description: "List recent expenses, optionally filtered by category",
      parameters: { type: "OBJECT",
        properties: {
          category: { type: "STRING", description: "Filter by category name" },
          limit:    { type: "NUMBER", description: "Max expenses to return" },
        } } },
    { name: "get_spending_by_category", description: "Get total spending grouped by category vs budget",
      parameters: { type: "OBJECT", properties: {} } },
  ],
};

// ── SKILL 2: Budget Analysis ──────────────────────────────────────────────────
const budgetSkill = {
  instructions: "Analyze budget vs actual spending, identify overspending, show financial health.",
  tools: {
    get_budget_status: () => {
      const spending = {};
      ledger.expenses.forEach((e) => { spending[e.category] = (spending[e.category] || 0) + e.amount; });
      const totalSpent = Object.values(spending).reduce((a, b) => a + b, 0);
      const remaining = ledger.income - totalSpent;
      return {
        income: ledger.income,
        totalSpent,
        remaining,
        savingsRate: `${((remaining / ledger.income) * 100).toFixed(1)}%`,
        categories: Object.entries(ledger.budget).map(([cat, budget]) => ({
          category: cat, budget, spent: spending[cat] || 0,
          status: (spending[cat] || 0) > budget ? "⚠️ Over budget" : "✅ Within budget",
          difference: budget - (spending[cat] || 0),
        })),
      };
    },
    set_budget: ({ category, amount }) => {
      ledger.budget[category] = amount;
      return { success: true, message: `Budget for ${category} set to $${amount}/month` };
    },
  },
  declarations: [
    { name: "get_budget_status", description: "Get full budget vs actual spending analysis with status per category",
      parameters: { type: "OBJECT", properties: {} } },
    { name: "set_budget", description: "Set or update a monthly budget for a category",
      parameters: { type: "OBJECT",
        properties: {
          category: { type: "STRING" },
          amount:   { type: "NUMBER", description: "Monthly budget amount in USD" },
        },
        required: ["category", "amount"] } },
  ],
};

// ── SKILL 3: Savings Goals ────────────────────────────────────────────────────
const savingsSkill = {
  instructions: "Track savings goals, calculate time to reach targets, suggest saving plans.",
  tools: {
    list_goals: () => ledger.savingsGoals.map((g) => ({
      ...g,
      remaining: g.target - g.saved,
      progress: `${((g.saved / g.target) * 100).toFixed(0)}%`,
    })),
    add_to_goal: ({ goal_id, amount }) => {
      const goal = ledger.savingsGoals.find((g) => g.id === goal_id);
      if (!goal) return { error: "Goal not found" };
      goal.saved += amount;
      return { success: true, goal: goal.name, newTotal: goal.saved,
        remaining: goal.target - goal.saved, progress: `${((goal.saved / goal.target) * 100).toFixed(0)}%` };
    },
    create_goal: ({ name, target }) => {
      const goal = { id: ledger.savingsGoals.length + 1, name, target, saved: 0 };
      ledger.savingsGoals.push(goal);
      return { success: true, goal };
    },
  },
  declarations: [
    { name: "list_goals", description: "List all savings goals with progress",
      parameters: { type: "OBJECT", properties: {} } },
    { name: "add_to_goal", description: "Add money to a savings goal",
      parameters: { type: "OBJECT",
        properties: {
          goal_id: { type: "NUMBER", description: "Goal ID number" },
          amount:  { type: "NUMBER", description: "Amount to add in USD" },
        },
        required: ["goal_id", "amount"] } },
    { name: "create_goal", description: "Create a new savings goal",
      parameters: { type: "OBJECT",
        properties: {
          name:   { type: "STRING", description: "Goal name like Emergency Fund" },
          target: { type: "NUMBER", description: "Target amount in USD" },
        },
        required: ["name", "target"] } },
  ],
};

// ── Build agent ───────────────────────────────────────────────────────────────
const allSkills = [expenseSkill, budgetSkill, savingsSkill];
const toolFns = Object.assign({}, ...allSkills.map((s) => s.tools));
const tools = [{ functionDeclarations: allSkills.flatMap((s) => s.declarations) }];

async function financeAgent(request) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", tools,
    systemInstruction: `You are a personal finance advisor. You help track spending,
      analyze budgets, and plan savings. Be encouraging but honest about overspending.
      Always give actionable advice with specific dollar amounts.`,
  });

  const chat = model.startChat();
  console.log(`\n💰 Request: ${request}`);
  console.log("─".repeat(55));

  let resp = await chat.sendMessage(request);
  while (true) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) { console.log("\n🤖 Finance Advisor:\n" + parts.map((p) => p.text || "").join("")); return; }
    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      console.log(`  🔧 ${name}(${JSON.stringify(args)})`);
      return { functionResponse: { name, response: toolFns[name](args) } };
    });
    resp = await chat.sendMessage(results);
  }
}

async function main() {
  await financeAgent("Give me a full budget analysis — where am I overspending this month?");
  await financeAgent("I just spent $55 on groceries today. Add it and then show my food spending total.");
  await financeAgent("Show my savings goals and tell me how many months to reach each one if I save $200/month extra.");
}

main().catch(console.error);
