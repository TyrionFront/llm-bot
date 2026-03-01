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
