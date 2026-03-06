import { GITHUB_REPOS_URL, OPENROUTER_MODELS_URL } from "../../src/constants";

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
