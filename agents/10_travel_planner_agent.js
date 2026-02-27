// TRAVEL PLANNER AGENT — Skills: Weather + Flights + Hotels + Itinerary
// A single agent with 3 skills that plans your entire trip
// GEMINI_API_KEY=your_key node 10_travel_planner_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Fake data (replace with real APIs: OpenWeather, Skyscanner, Booking.com) ──
const weatherData = {
  dubai:   { temp: 32, condition: "Sunny", humidity: "60%", bestMonth: "Nov-Mar" },
  paris:   { temp: 8,  condition: "Cloudy", humidity: "75%", bestMonth: "Apr-Jun" },
  bangkok: { temp: 35, condition: "Hot & Humid", humidity: "85%", bestMonth: "Nov-Feb" },
  london:  { temp: 10, condition: "Rainy", humidity: "80%", bestMonth: "Jun-Aug" },
};

const flights = {
  "karachi-dubai":   [{ airline: "Emirates",  price: 220, duration: "2h 15m", dep: "08:00" }],
  "karachi-paris":   [{ airline: "Qatar",     price: 680, duration: "9h 30m", dep: "23:00" }],
  "karachi-bangkok": [{ airline: "Thai Air",  price: 310, duration: "5h 45m", dep: "01:30" }],
  "lahore-dubai":    [{ airline: "flydubai",  price: 190, duration: "3h 00m", dep: "06:00" }],
};

const hotels = {
  dubai:   [{ name: "Rove Downtown",    stars: 3, price: 85,  perks: "Free breakfast, pool" }],
  paris:   [{ name: "Hotel des Grands", stars: 4, price: 140, perks: "Central, near Eiffel" }],
  bangkok: [{ name: "Novotel Siam",     stars: 4, price: 70,  perks: "BTS skytrain access" }],
};

// ── SKILL 1: Weather ──────────────────────────────────────────────────────────
const weatherSkill = {
  instructions: "Check weather and best travel seasons for destinations.",
  tools: {
    get_weather: ({ city }) => {
      const w = weatherData[city.toLowerCase()];
      return w || { error: `No weather data for ${city}` };
    },
  },
  declarations: [{
    name: "get_weather",
    description: "Get current weather and best travel season for a city",
    parameters: {
      type: "OBJECT",
      properties: { city: { type: "STRING", description: "City name" } },
      required: ["city"],
    },
  }],
};

// ── SKILL 2: Flights ──────────────────────────────────────────────────────────
const flightSkill = {
  instructions: "Search flights between cities and find best prices.",
  tools: {
    search_flights: ({ from, to }) => {
      const key = `${from.toLowerCase()}-${to.toLowerCase()}`;
      return flights[key] || { error: `No flights found from ${from} to ${to}` };
    },
  },
  declarations: [{
    name: "search_flights",
    description: "Search available flights from one city to another",
    parameters: {
      type: "OBJECT",
      properties: {
        from: { type: "STRING", description: "Departure city" },
        to:   { type: "STRING", description: "Destination city" },
      },
      required: ["from", "to"],
    },
  }],
};

// ── SKILL 3: Hotels ───────────────────────────────────────────────────────────
const hotelSkill = {
  instructions: "Find hotels and accommodations at the destination.",
  tools: {
    search_hotels: ({ city, max_price }) => {
      const cityHotels = hotels[city.toLowerCase()];
      if (!cityHotels) return { error: `No hotels found in ${city}` };
      return max_price
        ? cityHotels.filter((h) => h.price <= max_price)
        : cityHotels;
    },
  },
  declarations: [{
    name: "search_hotels",
    description: "Search hotels in a city with optional max price per night",
    parameters: {
      type: "OBJECT",
      properties: {
        city:      { type: "STRING", description: "City to find hotels in" },
        max_price: { type: "NUMBER", description: "Maximum price per night in USD" },
      },
      required: ["city"],
    },
  }],
};

// ── Build agent from skills ───────────────────────────────────────────────────
const allSkills = [weatherSkill, flightSkill, hotelSkill];
const toolFns   = Object.assign({}, ...allSkills.map((s) => s.tools));
const tools     = [{ functionDeclarations: allSkills.flatMap((s) => s.declarations) }];

async function travelAgent(request) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools,
    systemInstruction: `
      You are an expert travel planner. Use your skills to:
      1. Check weather at the destination
      2. Find available flights
      3. Recommend hotels within budget
      4. Give a brief day-by-day itinerary suggestion
      Always mention total estimated cost (flight + hotel x nights).
    `,
  });

  const chat = model.startChat();
  console.log(`\n✈️  Request: ${request}`);
  console.log("─".repeat(55));

  let resp = await chat.sendMessage(request);

  while (true) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);

    if (!calls.length) {
      console.log("\n🤖 Travel Planner:\n" + parts.map((p) => p.text || "").join(""));
      return;
    }

    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      console.log(`  🔧 ${name}(${JSON.stringify(args)})`);
      return { functionResponse: { name, response: toolFns[name](args) } };
    });

    resp = await chat.sendMessage(results);
  }
}

async function main() {
  await travelAgent("Plan a 5-day trip from Karachi to Dubai. Budget: $150/night for hotel.");
  await travelAgent("I want to visit Bangkok from Karachi for 3 days. What's the weather like and what will it cost?");
}

main().catch(console.error);
