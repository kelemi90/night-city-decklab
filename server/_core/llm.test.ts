import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { invokeLLM } from "./llm";

describe("LLM HTTP retry behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    ENV.aiAdvisorProvider = "omniroute";
    ENV.omniRouteBaseUrl = "https://omni.example/v1";
    ENV.omniRouteApiKey = "test-key";
    ENV.omniRouteModel = "test-model";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a 429 error immediately without retrying", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "Rate limit exceeded; try later" } }),
        {
          status: 429,
          statusText: "Too Many Requests",
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "Test" }] }),
    ).rejects.toThrow(/429 Too Many Requests.*Rate limit exceeded/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns other non-retryable client errors without retrying", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Invalid request", {
        status: 400,
        statusText: "Bad Request",
      }),
    );

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "Test" }] }),
    ).rejects.toThrow(/400 Bad Request.*Invalid request/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries a transient server error and succeeds on the next attempt", async () => {
    const success = {
      id: "test-response",
      created: 1,
      model: "test-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "OK" },
          finish_reason: "stop",
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("Temporary upstream error", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(success), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const result = await invokeLLM({
      messages: [{ role: "user", content: "Test" }],
    });

    expect(result.choices[0]?.message.content).toBe("OK");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
