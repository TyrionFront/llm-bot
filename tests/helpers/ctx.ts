import { mock } from "bun:test";
import type { CommandContext, Context, Filter } from "grammy";

type MockFn = ReturnType<typeof mock>;

export type MockCtx = {
    from: { id: number; username?: string };
    message: { text: string };
    reply: MockFn;
    replyWithChatAction: MockFn;
};

export function createMockCtx(options?: {
    userId?: number;
    username?: string;
    text?: string;
}): MockCtx & CommandContext<Context> & Filter<Context, "message:text"> {
    return {
        from: { id: options?.userId ?? 999, username: options?.username ?? "testuser" },
        message: { text: options?.text ?? "test message" },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
        replyWithChatAction: mock(() => Promise.resolve(true)),
    } as unknown as MockCtx & CommandContext<Context> & Filter<Context, "message:text">;
}
