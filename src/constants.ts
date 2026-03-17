export const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_KEY}`;
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const GITHUB_REPOS_URL = "https://api.github.com/repos";
export const LMARENA_LEADERBOARD_URL =
    "https://raw.githubusercontent.com/lmarena/arena-catalog/main/data/leaderboard-text.json";
export const SWEBENCH_EXPERIMENTS_URL =
    "https://raw.githubusercontent.com/swe-bench/experiments/main/evaluation/verified";
export const SWEBENCH_VERIFIED_TOTAL = 500;

export const LMARENA_CATEGORIES = [
    "coding",
    "creative_writing",
    "math",
    "expert",
    "if",
    "multiturn",
] as const;

export const LMARENA_CATEGORY_LABEL: Record<string, string> = {
    coding: "Coding",
    creative_writing: "Creative Writing",
    math: "Math",
    expert: "Expert",
    if: "Instruction Following",
    multiturn: "Multiturn",
};

export const LMARENA_CATEGORY_DESCRIPTION: Record<string, string> = {
    coding: "Models ranked by their ability to write, debug, and reason about code based on human preference votes.",
    creative_writing:
        "Models ranked on open-ended writing tasks — stories, poetry, and imaginative prose — judged by human preference.",
    math: "Models ranked on mathematical problem-solving, from arithmetic to competition-level proofs.",
    expert: "Models ranked on domain-specific expert knowledge across fields such as medicine, law, and science.",
    if: "Models ranked on how precisely they follow complex, multi-constraint instructions without deviation.",
    multiturn:
        "Models ranked on multi-message conversation quality — how well they maintain context, coherence, and helpfulness across a full dialogue.",
};

export const LMARENA_RATING_COMMANDS = LMARENA_CATEGORIES.map((cat) => ({
    command: `ratings_${cat}`,
    description: `ELO top 10 — ${LMARENA_CATEGORY_LABEL[cat]}`,
}));

export const USER_COMMANDS = [
    { command: "start", description: "Show bot info & available commands" },
    {
        command: "ratings",
        description: "Overall ELO leaderboard (all categories combined)",
    },
    {
        command: "pricing",
        description: "Pricing links for vendors in any TOP list",
    },
    {
        command: "tools",
        description: "Coding agents & frameworks ranked by GitHub stars",
    },
    ...LMARENA_RATING_COMMANDS,
];

export const ADMIN_COMMANDS = [
    ...USER_COMMANDS,
    {
        command: "sync",
        description: "Sync all data from upstream APIs (admin only)",
    },
];

export const USER_COMMAND_LINES = USER_COMMANDS.filter(
    (c) => c.command !== "start",
)
    .map((c) => `/${c.command} — ${c.description}`)
    .join("\n");

export const ADMIN_COMMAND_LINES =
    USER_COMMAND_LINES +
    "\n/sync — sync all data from upstream APIs <i>(admin only)</i>";

export const CATEGORY_LABEL: Record<string, string> = {
    agent: "🤖 Agent",
    framework: "🔗 Framework",
    platform: "🛠 Platform",
};

export const TELEGRAM_MAX_LENGTH = 4096;
export const TOP_MODELS_LIMIT = 10;
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
