// Registry van tools die de chat-bot mag aanroepen (Anthropic tool-use).

const { VERKOOPPUNT_TOOL, runVerkooppuntTool } = require('./verkooppunten');
const { KENNIS_TOOL, runKennisTool } = require('./kennis');
const { WEATHER_TOOL, runWeatherTool } = require('./weather');

const CHAT_TOOLS = [VERKOOPPUNT_TOOL, KENNIS_TOOL, WEATHER_TOOL];

// Voer een tool uit op naam; geeft een tekst (of promise daarvan) terug voor
// het model. ctx draagt verzoek-context mee (bv. geo = gedeelde browserlocatie).
async function runTool(name, input, ctx = {}) {
  if (name === 'find_verkooppunt') return runVerkooppuntTool(input);
  if (name === 'zoek_kennis') return runKennisTool(input);
  if (name === 'weather_lookup') return runWeatherTool(input, ctx);
  return `Onbekende tool: ${name}`;
}

module.exports = { CHAT_TOOLS, runTool };
