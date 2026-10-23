import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  provider?: "ollama" | "lmstudio" | "omniroute";
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const isLocalAiConfigured = () =>
  (ENV.localAiProvider === "ollama" || ENV.localAiProvider === "lmstudio") &&
  Boolean(ENV.localAiBaseUrl);

const isOmniRouteConfigured = () =>
  ENV.aiAdvisorProvider === "omniroute" &&
  Boolean(ENV.omniRouteBaseUrl) &&
  Boolean(ENV.omniRouteApiKey);

const resolveLocalApiUrl = () =>
  `${ENV.localAiBaseUrl.replace(/\/$/, "")}/chat/completions`;

const resolveLocalModel = (model?: string) =>
  model ||
  ENV.localAiModel ||
  (ENV.localAiProvider === "ollama" ? "llama3.2:3b" : "local-model");

const resolveOmniRouteApiUrl = () =>
  `${ENV.omniRouteBaseUrl.replace(/\/$/, "")}/chat/completions`;

const resolveOmniRouteModel = (model?: string) =>
  model || ENV.omniRouteModel || "openrouter/google/gemini-3.5-flash";


const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

// Equal-jitter exponential backoff. The cap/2 floor guarantees a minimum
// delay so a misbehaving caller loop slows down instead of hammering the
// upstream while it keeps returning errors.
const computeBackoffDelay = (
  attempt: number,
  retryAfterMs?: number
): number => {
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }

  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  return cap / 2 + Math.random() * (cap / 2);
};

// Retry transient server errors and network failures. Client errors such as
// 429 are returned immediately so callers can surface the provider's message
// instead of making an interactive request wait through several long retries.
const fetchWithBackoff = async (
  url: string,
  init: FetchInit
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);

      const isRetryableStatus =
        response.status === 408 || response.status >= 500;

      if (
        response.ok ||
        response.status === 429 ||
        !isRetryableStatus ||
        attempt === RETRY_MAX_RETRIES
      ) {
        return response;
      }

      let retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );

      if (response.status === 429) {
        try {
          const retryBody = await response.clone().json() as {
            error?: {
              reset_seconds?: number;
              retry_after?: string;
            };
          };

          const resetSeconds = retryBody.error?.reset_seconds;

          if (
            typeof resetSeconds === "number" &&
            Number.isFinite(resetSeconds) &&
            resetSeconds > 0
          ) {
            retryAfterMs = resetSeconds * 1000;
          } else if (retryBody.error?.retry_after) {
            const bodyRetryAfter = parseRetryAfter(
              retryBody.error.retry_after
            );

            if (bodyRetryAfter !== undefined) {
              retryAfterMs = bodyRetryAfter;
            }
          }
        } catch {
          // Fall back to the Retry-After header or exponential backoff.
        }
      }

      try {
        await response.body?.cancel();
      } catch {
        // Body already settled; nothing to clean up.
      }

      const delayMs = computeBackoffDelay(attempt, retryAfterMs);

      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status} in ${Math.ceil(delayMs / 1000)}s`
      );

      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after exhausting retries");
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const {
    messages,
    provider: requestedProvider,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
  } = params;

  const provider = requestedProvider ?? ENV.aiAdvisorProvider;

  if (provider === "ollama" || provider === "lmstudio") {
    if (!isLocalAiConfigured()) {
      throw new Error("Local AI is not configured");
    }
  } else if (provider === "omniroute") {
    if (!isOmniRouteConfigured()) {
      throw new Error("OmniRoute is not configured");
    }
  } else {
    throw new Error(
      `Unsupported AI advisor provider: ${provider || "(empty)"}`
    );
  }

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  if (provider === "omniroute") {
    payload.model = resolveOmniRouteModel(model);
  } else {
    payload.model = resolveLocalModel(model);
  }

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );

  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxTokens = max_tokens ?? maxTokens;

  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }

  if (thinking) {
    payload.thinking = thinking;
  }

  if (reasoning) {
    payload.reasoning = reasoning;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const isOmniRoute = provider === "omniroute";

  console.log(
    "[llm] provider request:",
    JSON.stringify({
      provider,
      model: payload.model,
      max_tokens: payload.max_tokens,
      response_format: payload.response_format,
    }),
  );

  const response = await fetchWithBackoff(
    isOmniRoute
      ? resolveOmniRouteApiUrl()
      : resolveLocalApiUrl(),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${
          isOmniRoute
            ? ENV.omniRouteApiKey
            : ENV.localAiApiKey
        }`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = (await response.text())
      .slice(0, 1200)
      .replace(/(bearer\\s+)[^\\s"',}]+/gi, "$1[REDACTED]")
      .replace(
        /((?:api[_-]?key|access[_-]?token|authorization)\\s*[:=]\\s*)["']?[^"',\\s}]+/gi,
        "$1[REDACTED]"
      );

    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const responseBody = await response.json();

  console.log(
    "[llm] raw provider response:",
    JSON.stringify(responseBody, null, 2),
  );

  return responseBody as InvokeResult;
}

export function getAiProviderStatus() {
  if (ENV.aiAdvisorProvider === "omniroute") {
    return {
      provider: "OmniRoute",
      configured: isOmniRouteConfigured(),
      model: resolveOmniRouteModel(),
      baseUrl: ENV.omniRouteBaseUrl,
    };
  }

  if (isLocalAiConfigured()) {
    return {
      provider:
        ENV.localAiProvider === "lmstudio"
          ? "LM Studio"
          : "Ollama",
      configured: true,
      model: resolveLocalModel(),
      baseUrl: ENV.localAiBaseUrl,
    };
  }

  return {
    provider: "Local AI",
    configured: false,
    model: "",
    baseUrl: "",
  };
}
