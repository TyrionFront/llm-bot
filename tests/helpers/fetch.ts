import { GITHUB_REPOS_URL, LMARENA_LEADERBOARD_URL, OPENROUTER_MODELS_URL } from "../../src/constants";

const OPENROUTER_SYNC_IDS = [
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.5-pro",
    "openai/gpt-4o",
    "bytedance-seed/seed-2.0-mini",
    "x-ai/grok-4",
    "meta-llama/llama-4-maverick",
    "deepseek/deepseek-r1",
    "microsoft/phi-4",
    "mistralai/mistral-large",
    "cohere/command-r-plus-08-2024",
];

export type FetchOverride = (url: string) => Response | null;

export function createFetchMock(override?: FetchOverride): typeof global.fetch {
    const fn = async (input: string | URL | Request): Promise<Response> => {
        const url = input instanceof Request ? input.url : String(input);

        if (override) {
            const result = override(url);
            if (result) return result;
        }

        if (url.includes(OPENROUTER_MODELS_URL)) {
            return new Response(
                JSON.stringify({ data: OPENROUTER_SYNC_IDS.map((id) => ({ id })) }),
            );
        }

        if (url.includes("oleksiikilevoi.site")) {
            return new Response(JSON.stringify({ ok: true }));
        }

        if (url === LMARENA_LEADERBOARD_URL) {
            const models = {
                "claude-opus-4-5-20251101-thinking-32k": { rating: 1505, rating_q975: 1520, rating_q025: 1490 },
                "gemini-3-pro":                          { rating: 1500, rating_q975: 1515, rating_q025: 1485 },
                "gpt-5.1-high":                          { rating: 1478, rating_q975: 1493, rating_q025: 1463 },
                "grok-4.1-thinking":                     { rating: 1473, rating_q975: 1488, rating_q025: 1458 },
                "llama-4-maverick-17b-128e-instruct":    { rating: 1468, rating_q975: 1483, rating_q025: 1453 },
                "deepseek-r1-0528":                      { rating: 1462, rating_q975: 1477, rating_q025: 1447 },
                "phi-4":                                 { rating: 1455, rating_q975: 1470, rating_q025: 1440 },
                "mistral-large-3":                       { rating: 1448, rating_q975: 1463, rating_q025: 1433 },
                "command-a-03-2025":                     { rating: 1435, rating_q975: 1450, rating_q025: 1420 },
            };
            return new Response(JSON.stringify({
                coding:           models,
                creative_writing: models,
                math:             models,
                expert:           models,
                if:               models,
                multiturn:        models,
            }));
        }

        if (url.includes(`${GITHUB_REPOS_URL}/langchain-ai/langgraph`)) {
            return new Response(JSON.stringify({ stargazers_count: 42300 }));
        }

        if (url.includes(`${GITHUB_REPOS_URL}/anomalyco/opencode`)) {
            return new Response(JSON.stringify({ stargazers_count: 15000 }));
        }

        if (url.includes("generativelanguage.googleapis.com")) {
            return new Response(
                JSON.stringify({
                    candidates: [{ content: { parts: [{ text: "Test AI response about LLMs." }] } }],
                }),
            );
        }

        throw new Error(`Unmocked fetch call to: ${url}`);
    };
    return fn as typeof global.fetch;
}
