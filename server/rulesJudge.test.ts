import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { invokeLLM } = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM,
}));

const comprehensiveFixture = {
  updated_at: "2026-10-01T00:00:00.000Z",
  items: [
    {
      id: "rule-fixture-damage-prevention",
      stable_anchor: "damage-prevention",
      title: "Damage Prevention",
      display_number: "4.2",
      body_markdown:
        "Damage prevention effects prevent damage dealt to units during combat.",
    },
  ],
};

const tournamentFixture = {
  updated_at: "2026-10-01T00:00:00.000Z",
  items: [
    {
      id: "rule-fixture-tournament-procedures",
      stable_anchor: "tournament-procedures",
      title: "Tournament Procedures",
      display_number: "2.1",
      body_markdown:
        "Tournament procedures explain how players resolve a judge call.",
    },
  ],
};

const faqFixture = {
  updated_at: "2026-10-01T00:00:00.000Z",
  items: [
    {
      id: "faq-fixture-damage-prevention",
      question: "How does damage prevention work?",
      answer: "Prevented damage is not dealt to the unit.",
    },
    {
      id: "faq-fixture-prevention-timing",
      question: "When does damage prevention apply?",
      answer: "Apply the relevant prevention effect when damage would be dealt.",
    },
    {
      id: "faq-fixture-judge-calls",
      question: "How do tournament judge calls work?",
      answer: "Ask the tournament judge to resolve the situation.",
    },
    {
      id: "faq-fixture-action-prevention",
      question: "What happens if another effect prevents an action?",
      answer:
        "If an effect allows or requires an action but another effect prevents it, follow the applicable rule.",
    },
  ],
};

function fixtureResponse(url: string): unknown {
  if (url.endsWith("/cyberpunk/comprehensive-rules")) {
    return comprehensiveFixture;
  }

  if (url.endsWith("/cyberpunk/tournament-rules")) {
    return tournamentFixture;
  }

  if (url.endsWith("/faqs/cyberpunk")) {
    return faqFixture;
  }

  throw new Error(`Unexpected test URL: ${url}`);
}

describe("Rules Judge evidence retrieval", () => {
  beforeEach(() => {
    vi.resetModules();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        return new Response(JSON.stringify(fixtureResponse(url)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retrieves comprehensive rules and preserves multiple relevant FAQs", async () => {
    const { retrieveRulesEvidence } = await import("./rulesJudge");

    const sources = await retrieveRulesEvidence(
      "How does damage prevention work, and what happens if an effect prevents only part of the damage?",
    );

    expect(
      sources.some(
        (source) =>
          source.type === "comprehensive" &&
          source.title.includes("Damage Prevention"),
      ),
    ).toBe(true);

    const faqs = sources.filter((source) => source.type === "faq");

    expect(faqs).toHaveLength(2);
    expect(faqs.every((source) =>
      source.url === "https://cyberpunktcg.com/rules-faq"
    )).toBe(true);
    expect(sources.some((source) =>
      source.type === "comprehensive" &&
      source.url.startsWith("https://cyberpunktcg.com/comprehensive-rules")
    )).toBe(true);
    expect(faqs.map((source) => source.title)).toEqual(
      expect.arrayContaining([
        "Official FAQ: How does damage prevention work?",
        "Official FAQ: When does damage prevention apply?",
      ]),
    );

    expect(new Set(sources.map((source) => source.id)).size).toBe(
      sources.length,
    );
    expect(faqs.some((source) =>
      source.title.includes("another effect prevents an action")
    )).toBe(false);
  });

  it("does not treat an action-prevention FAQ as damage-prevention evidence", async () => {
    const { retrieveRulesEvidence } = await import("./rulesJudge");

    const sources = await retrieveRulesEvidence(
      "If damage prevention prevents only part of the damage, what happens to the remaining damage?",
    );

    const unrelatedFaq = sources.find(
      (source) =>
        source.type === "faq" &&
        source.title.includes("another effect prevents an action"),
    );

    expect(unrelatedFaq).toBeUndefined();

    // The fixtures describe ordinary damage prevention only. They do not
    // specify how partial prevention or remaining damage is handled.
    const damageFaqs = sources.filter(
      (source) =>
        source.type === "faq" &&
        source.title.toLowerCase().includes("damage prevention"),
    );

    expect(damageFaqs.length).toBeGreaterThan(0);
    expect(
      damageFaqs.some((source) =>
        /remaining damage|partial damage|prevented amount/i.test(source.excerpt)
      ),
    ).toBe(false);
  });

  it("retrieves the real local card text when a card is named", async () => {
    const { retrieveRulesEvidence } = await import("./rulesJudge");

    const sources = await retrieveRulesEvidence(
      "V Streetkid BRAINDANCE trash",
    );

    const cardSource = sources.find(
      (source) =>
        source.type === "card" &&
        source.title.includes("V — card text"),
    );

    expect(cardSource).toBeDefined();
    expect(cardSource?.excerpt).toContain("BRAINDANCE");
    expect(cardSource?.excerpt).toContain("Rules text:");
  });

  it("returns no evidence for an unrelated question instead of inventing sources", async () => {
    const { retrieveRulesEvidence } = await import("./rulesJudge");

    const sources = await retrieveRulesEvidence(
      "quasar nebula zorb",
    );

    expect(sources).toEqual([]);
  });

  it("fails safely when an official endpoint returns an HTTP error", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/cyberpunk/comprehensive-rules")) {
        return new Response("Service unavailable", { status: 503 });
      }

      return new Response(JSON.stringify(fixtureResponse(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { retrieveRulesEvidence } = await import("./rulesJudge");

    await expect(
      retrieveRulesEvidence("damage prevention"),
    ).rejects.toThrow(
      "Official rules data is temporarily unavailable or invalid. Please try again later.",
    );
  });

  it("rejects malformed JSON from an official endpoint with a safe error", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/cyberpunk/comprehensive-rules")) {
        return new Response("{not valid JSON", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify(fixtureResponse(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { retrieveRulesEvidence } = await import("./rulesJudge");

    await expect(
      retrieveRulesEvidence("damage prevention"),
    ).rejects.toThrow(
      "Official rules data is temporarily unavailable or invalid. Please try again later.",
    );
  });

  it("rejects rule documents with invalid item structures", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/cyberpunk/comprehensive-rules")) {
        return new Response(JSON.stringify({
          updated_at: "2026-10-01T00:00:00.000Z",
          items: [{ title: "Damage Prevention", body_markdown: "Some text" }],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify(fixtureResponse(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { retrieveRulesEvidence } = await import("./rulesJudge");

    await expect(
      retrieveRulesEvidence("damage prevention"),
    ).rejects.toThrow(
      "Official rules data is temporarily unavailable or invalid. Please try again later.",
    );
  });

  it("rejects FAQ documents with missing required fields", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/faqs/cyberpunk")) {
        return new Response(JSON.stringify({
          items: [{ id: "faq-without-answer", question: "How does this work?" }],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify(fixtureResponse(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { retrieveRulesEvidence } = await import("./rulesJudge");

    await expect(
      retrieveRulesEvidence("damage prevention"),
    ).rejects.toThrow(
      "Official rules data is temporarily unavailable or invalid. Please try again later.",
    );
  });

  it("uses the official API endpoints for rules and FAQ evidence", async () => {
    const { retrieveRulesEvidence } = await import("./rulesJudge");

    await retrieveRulesEvidence("damage prevention");

    const requestedUrls = vi.mocked(fetch).mock.calls.map(
      ([input]) => String(input),
    );

    expect(requestedUrls).toContain(
      "https://api.netdeck.gg/api/cyberpunk/comprehensive-rules",
    );
    expect(requestedUrls).toContain(
      "https://api.netdeck.gg/api/cyberpunk/tournament-rules",
    );
    expect(requestedUrls).toContain(
      "https://api.netdeck.gg/api/faqs/cyberpunk",
    );

    const tournamentSources = await retrieveRulesEvidence(
      "tournament judge call",
    );
    expect(tournamentSources.some((source) =>
      source.type === "tournament" &&
      source.url.startsWith("https://cyberpunktcg.com/tournament-rules")
    )).toBe(true);
  });
});

describe("Rules Judge answer generation", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeLLM.mockReset();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        return new Response(
          JSON.stringify(fixtureResponse(String(input))),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("instructs the model to acknowledge unresolved questions", async () => {
    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content:
              "Ruling: The evidence is insufficient to determine partial damage prevention. [S1]",
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"verdict":"supported"}' } }],
      });

    const { askRulesJudge } = await import("./rulesJudge");

    await askRulesJudge({
      question:
        "How does damage prevention work, and what happens if an effect prevents only part of the damage?",
      provider: "ollama",
    });

    expect(invokeLLM).toHaveBeenCalledTimes(2);

    const request = invokeLLM.mock.calls[0]?.[0];
    const systemMessage = request.messages.find(
      (message: { role: string }) => message.role === "system",
    );

    expect(systemMessage?.content).toContain(
      "explicitly say that it is insufficient",
    );
    expect(systemMessage?.content).toContain(
      "Do not infer an exception, override, or special interaction",
    );
  });

  it("rejects an answer containing an unknown citation ID", async () => {
    invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content:
            "Ruling: Partial prevention always overrides other effects. [S999]",
        },
      }],
    });

    const { askRulesJudge } = await import("./rulesJudge");

    const result = await askRulesJudge({
      question: "How does damage prevention work?",
      provider: "ollama",
    });

    expect(result.answer).toContain(
      "I couldn't verify the generated ruling",
    );
    expect(result.answer).not.toContain(
      "Partial prevention always overrides",
    );
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.evidenceFound).toBe(true);
  });

  it("preserves an answer that cites a supplied source", async () => {
    const supportedAnswer =
      "Ruling: Prevented damage is not dealt to the unit. [S1]";

    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: { content: supportedAnswer },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"verdict":"supported"}' } }],
      });

    const { askRulesJudge } = await import("./rulesJudge");

    const result = await askRulesJudge({
      question: "How does damage prevention work?",
      provider: "ollama",
    });

    expect(result.answer).toBe(supportedAnswer);
    expect(result.sources.some((source) => source.id === "S1")).toBe(true);
  });

  it("does not treat a valid citation as proof that a claim is supported", async () => {
    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content:
              "Ruling: Damage prevention doubles a unit's power for the rest of the turn. [S1]",
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"verdict":"unsupported"}' } }],
      });

    const { askRulesJudge } = await import("./rulesJudge");
    const result = await askRulesJudge({
      question: "How does damage prevention work?",
      provider: "ollama",
    });

    expect(result.answer).not.toContain("doubles a unit's power");
    expect(result.answer).toContain("I couldn't verify");
    expect(result.sources.some((source) => source.id === "S1")).toBe(true);
  });

  it("fails closed when the verifier cannot establish support", async () => {
    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: "Ruling: Prevented damage is not dealt to the unit. [S1]",
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"verdict":"uncertain"}' } }],
      });

    const { askRulesJudge } = await import("./rulesJudge");
    const result = await askRulesJudge({
      question: "How does damage prevention work?",
      provider: "ollama",
    });

    expect(result.answer).toContain(
      "I couldn't verify that every material claim",
    );
    expect(result.answer).not.toContain("Prevented damage is not dealt");
  });

  it("fails closed when the verifier returns malformed JSON", async () => {
    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: "Ruling: Prevented damage is not dealt to the unit. [S1]",
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{
          message: { content: 'The answer looks fine: {"verdict":"supported"}' },
        }],
      });

    const { askRulesJudge } = await import("./rulesJudge");
    const result = await askRulesJudge({
      question: "How does damage prevention work?",
      provider: "ollama",
    });

    expect(result.answer).toContain(
      "I couldn't verify that every material claim",
    );
    expect(result.answer).not.toContain("Prevented damage is not dealt");
    expect(invokeLLM).toHaveBeenCalledTimes(2);
  });

  it("rejects an answer that contains no source citations", async () => {
    invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: "Ruling: Damage prevention always takes precedence.",
        },
      }],
    });

    const { askRulesJudge } = await import("./rulesJudge");

    const result = await askRulesJudge({
      question: "How does damage prevention work?",
      provider: "ollama",
    });

    expect(result.answer).toContain(
      "I couldn't verify the generated ruling",
    );
    expect(result.answer).not.toContain(
      "Damage prevention always takes precedence",
    );
  });

  it("rejects an unsupported partial-damage claim even with a valid citation", async () => {
    const unsupportedAnswer =
      "Ruling: Any damage not prevented is dealt as normal. [S1]";

    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: { content: unsupportedAnswer },
        }],
      })
      // Deliberately simulate a verifier false positive: the targeted
      // partial-damage safeguard must still reject this answer.
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"verdict":"supported"}' } }],
      });

    const { askRulesJudge } = await import("./rulesJudge");

    const result = await askRulesJudge({
      question:
        "If damage prevention prevents only part of the damage, what happens to the remaining damage?",
      provider: "ollama",
    });

    expect(result.sources.some((source) => source.id === "S1")).toBe(true);
    expect(result.answer).toContain(
      "I couldn't verify what happens to the remaining damage",
    );
    expect(result.answer).not.toContain(
      "Any damage not prevented is dealt as normal",
    );
    expect(result.evidenceFound).toBe(true);
  });

  it("catches a paraphrased partial-damage question", async () => {
    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: "Ruling: The leftover damage is dealt normally. [S1]",
          },
        }],
      })
      // Simulate a verifier false positive to test the targeted safeguard.
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"verdict":"supported"}' } }],
      });

    const { askRulesJudge } = await import("./rulesJudge");

    const result = await askRulesJudge({
      question: "What happens to damage left over after an effect reduces the amount?",
      provider: "ollama",
    });

    expect(result.answer).toContain(
      "I couldn't verify what happens to the remaining damage",
    );
    expect(result.answer).not.toContain(
      "The leftover damage is dealt normally",
    );
  });

  it("preserves an explicit uncertainty answer when partial-damage rules are missing", async () => {
    const cautiousAnswer =
      "Ruling: The evidence is insufficient to determine what happens to the remaining damage. [S1]\n" +
      "Why: The supplied sources describe ordinary damage prevention but do not explain partial prevention.\n" +
      "Uncertainty: The relevant partial-damage rule is missing.";

    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: { content: cautiousAnswer },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"verdict":"supported"}' } }],
      });

    const { askRulesJudge } = await import("./rulesJudge");

    const result = await askRulesJudge({
      question:
        "How does damage prevention work, and what happens if an effect prevents only part of the damage?",
      provider: "ollama",
    });

    expect(result.answer).toBe(cautiousAnswer);
    expect(result.answer).toContain("insufficient");
    expect(result.answer).toContain("partial prevention");
    expect(result.answer).toContain("[S1]");
  });

  it("fails closed when the verifier provider throws", async () => {
    const proposedAnswer =
      "Ruling: Prevented damage is not dealt to the unit. [S1]";

    invokeLLM
      .mockResolvedValueOnce({
        choices: [{ message: { content: proposedAnswer } }],
      })
      .mockRejectedValueOnce(new Error("Verifier provider unavailable"));

    const { askRulesJudge } = await import("./rulesJudge");

    const result = await askRulesJudge({
      question: "How does damage prevention work?",
      provider: "ollama",
    });

    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(result.answer).toContain(
      "I couldn't verify that every material claim",
    );
    expect(result.answer).not.toContain(
      "Prevented damage is not dealt to the unit",
    );
    expect(result.sources.some((source) => source.id === "S1")).toBe(true);
  });

  it("passes the original question, evidence, and proposed answer to the verifier", async () => {
    const question = "How does damage prevention work?";
    const proposedAnswer =
      "Ruling: Prevented damage is not dealt to the unit. [S1]";

    invokeLLM
      .mockResolvedValueOnce({
        choices: [{ message: { content: proposedAnswer } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"verdict":"supported"}' } }],
      });

    const { askRulesJudge } = await import("./rulesJudge");

    const result = await askRulesJudge({
      question,
      provider: "ollama",
    });

    expect(result.answer).toBe(proposedAnswer);
    expect(invokeLLM).toHaveBeenCalledTimes(2);

    const verifierRequest = invokeLLM.mock.calls[1]?.[0];
    expect(verifierRequest.messages).toHaveLength(2);

    const verifierSystem = verifierRequest.messages.find(
      (message: { role: string }) => message.role === "system",
    );
    const verifierUser = verifierRequest.messages.find(
      (message: { role: string }) => message.role === "user",
    );

    expect(verifierSystem?.content).toContain(
      "A citation ID existing is not enough",
    );
    expect(verifierUser?.content).toContain(`RULES QUESTION:\n${question}`);
    expect(verifierUser?.content).toContain("RETRIEVED EVIDENCE:");
    expect(verifierUser?.content).toContain("[S1]");
    expect(verifierUser?.content).toContain(
      `PROPOSED ANSWER TO VERIFY:\n${proposedAnswer}`,
    );
  });

  it("throws when the model returns an empty answer", async () => {
    invokeLLM.mockResolvedValue({
      choices: [{
        message: { content: "   " },
      }],
    });

    const { askRulesJudge } = await import("./rulesJudge");

    await expect(
      askRulesJudge({
        question: "How does damage prevention work?",
        provider: "ollama",
      }),
    ).rejects.toThrow("The AI provider returned an empty rules answer.");
  });
});
