export type OpenRouterModel = { id: string }

export type OpenRouterResponse = { data: OpenRouterModel[] }

export type GitHubRepo = {
    stargazers_count: number
}

export type GeminiResponse = {
    candidates?: { content: { parts: { text: string }[] } }[]
}

export type GeminiErrorResponse = {
    error?: { message?: string; details?: { retryDelay?: string }[] }
}

export type RateLimitResult = { allowed: boolean; reason?: string }

export type LmarenaModel = {
    rating: number;
    rating_q975: number;
    rating_q025: number;
}

export type LmarenaCategory = Record<string, LmarenaModel>

export type LmarenaLeaderboard = Record<string, LmarenaCategory>

export type SweBenchResults = {
    resolved: string[]
}
