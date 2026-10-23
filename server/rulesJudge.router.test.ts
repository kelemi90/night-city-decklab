import { beforeEach, describe, expect, it, vi } from "vitest";

const { askRulesJudge } = vi.hoisted(() => ({
  askRulesJudge: vi.fn(),
}));

vi.mock("./rulesJudge", () => ({
  askRulesJudge,
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "rules-judge-router-test",
    email: "rules-judge-router-test@example.com",
    name: "Rules Judge Router Test",
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Rules Judge router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards the question and provider to the service", async () => {
    const expected = {
      answer: "The evidence supports this interpretation. [S1]",
      sources: [],
      provider: "omniroute",
      evidenceFound: true,
    };

    askRulesJudge.mockResolvedValue(expected);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.rulesJudge.ask({
      question: "How does this rule work?",
      provider: "omniroute",
    });

    expect(askRulesJudge).toHaveBeenCalledOnce();
    expect(askRulesJudge).toHaveBeenCalledWith({
      question: "How does this rule work?",
      provider: "omniroute",
    });
    expect(result).toEqual(expected);
  });

  it("allows the provider to be omitted", async () => {
    const expected = {
      answer: "Insufficient evidence.",
      sources: [],
      provider: "ollama",
      evidenceFound: false,
    };

    askRulesJudge.mockResolvedValue(expected);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.rulesJudge.ask({
      question: "What happens in this situation?",
    });

    expect(askRulesJudge).toHaveBeenCalledWith({
      question: "What happens in this situation?",
    });
    expect(result).toEqual(expected);
  });

  it("rejects blank questions before calling the service", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    await expect(
      caller.rulesJudge.ask({ question: "   " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(askRulesJudge).not.toHaveBeenCalled();
  });

  it("rejects questions longer than 1200 characters", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    await expect(
      caller.rulesJudge.ask({ question: "x".repeat(1201) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(askRulesJudge).not.toHaveBeenCalled();
  });

  it("rejects unsupported providers", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    await expect(
      caller.rulesJudge.ask({
        question: "Explain this rule",
        provider: "unsupported" as "ollama",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(askRulesJudge).not.toHaveBeenCalled();
  });
});
