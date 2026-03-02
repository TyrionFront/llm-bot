export const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_KEY}`;
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const GITHUB_REPOS_URL = "https://api.github.com/repos";

export const USER_COMMANDS = [
    { command: "start", description: "Show bot info & available commands" },
    { command: "ratings", description: "ELO leaderboard with vendor & source" },
    { command: "pricing", description: "Official pricing links per vendor" },
    { command: "tools", description: "Coding agents & frameworks ranked by GitHub stars" },
];

export const ADMIN_COMMANDS = [
    ...USER_COMMANDS,
    { command: "sync", description: "Sync all data from upstream APIs (admin only)" },
];

export const USER_COMMAND_LINES =
    "/ratings — ELO leaderboard with vendor & source\n" +
    "/pricing — official pricing links per vendor\n" +
    "/tools — coding agents & frameworks ranked by GitHub stars";

export const ADMIN_COMMAND_LINES =
    USER_COMMAND_LINES + "\n" +
    "/sync — sync all data from upstream APIs _(admin only)_";

export const CATEGORY_LABEL: Record<string, string> = {
    agent:     "🤖 Agent",
    framework: "🔗 Framework",
    platform:  "🛠 Platform",
};

export const GEMINI_RPM = 5;
export const GEMINI_RPD = 20;
export const ADMIN_ID = Number(process.env.ADMIN_ID);

export const GEMINI_SYSTEM_PROMPT =
    "You are an AI assistant embedded in an LLM leaderboard Telegram bot. " +
    "You may only answer questions directly related to Large Language Models (LLMs), " +
    "AI models, their capabilities, benchmarks, ELO ratings, pricing, and comparisons. " +
    "The models tracked in this bot are: claude-4-6-thinking (Anthropic), gemini-3-1-pro (Google), " +
    "gpt-5-2-latest (OpenAI), seed-2-0-pro (Bytedance), grok-4-1-think (xAI), " +
    "llama-4-maverick (Meta), deepseek-r3 (DeepSeek), phi-5-ultra (Microsoft), " +
    "mistral-large-3 (Mistral AI), command-r-plus-3 (Cohere). " +
    "If the user asks about anything unrelated to LLMs or AI models, politely decline " +
    "and remind them that this bot is restricted to LLM-related topics only.";
