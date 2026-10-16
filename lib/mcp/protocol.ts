/**
 * A small, dependency-free Model Context Protocol server over the
 * Streamable HTTP transport (stateless JSON mode): the platform's agent
 * runtime POSTs JSON-RPC 2.0 messages, we answer with JSON. Supports
 * `initialize`, `ping`, `tools/list` and `tools/call`; notifications get a
 * 202. GET (the optional SSE stream) is declined with 405 — every call is a
 * single request/response, which is all the tools here need.
 *
 * Why not the official SDK: the ibl.ai runtime only needs tools, the handler
 * must run on any Next.js host (edge or node) and stay unit-testable with
 * plain `Request`/`Response` objects, and the MCP JS packages were mid-split
 * (`@modelcontextprotocol/sdk` 1.x → `@modelcontextprotocol/server` 2.x) when
 * this was written. The wire format below is MCP 2025-06-18.
 *
 * Pure module: no Next.js imports; unit-tested in __tests__/mcp.test.ts.
 */

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type JsonSchema = Record<string, unknown>;

export interface ToolResultContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: ToolResultContent[];
  /** Machine-readable twin of the text, when `outputSchema` is declared. */
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDefinition<Ctx = unknown> {
  name: string;
  /** What the model reads to decide when to call the tool. */
  description: string;
  inputSchema: JsonSchema;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  handler: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
}

export interface McpServerInfo {
  name: string;
  version: string;
  title?: string;
  instructions?: string;
}

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

/** Results are JSON for the model; keep them compact and never include secrets. */
export function textResult(value: unknown): ToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const structured =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  return {
    content: [{ type: "text", text }],
    ...(structured && { structuredContent: structured }),
  };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Minimal JSON-Schema check: required keys present, declared primitive types respected. */
export function validateArgs(schema: JsonSchema, args: unknown): string | null {
  if (args === undefined || args === null) args = {};
  if (typeof args !== "object" || Array.isArray(args)) return "arguments must be an object";
  const a = args as Record<string, unknown>;
  const required = (schema.required as string[] | undefined) ?? [];
  for (const key of required) {
    if (a[key] === undefined || a[key] === null || a[key] === "") return `"${key}" is required`;
  }
  const props = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
  for (const [key, def] of Object.entries(props)) {
    const v = a[key];
    if (v === undefined || v === null) continue;
    const t = def.type as string | string[] | undefined;
    const types = Array.isArray(t) ? t : t ? [t] : [];
    if (!types.length) continue;
    const ok = types.some((type) => {
      switch (type) {
        case "string":
          return typeof v === "string";
        case "number":
        case "integer":
          return (
            typeof v === "number" &&
            Number.isFinite(v) &&
            (type === "number" || Number.isInteger(v))
          );
        case "boolean":
          return typeof v === "boolean";
        case "array":
          return Array.isArray(v);
        case "object":
          return typeof v === "object" && !Array.isArray(v);
        case "null":
          return v === null;
        default:
          return true;
      }
    });
    if (!ok) return `"${key}" must be ${types.join(" or ")}`;
    const en = def.enum as unknown[] | undefined;
    if (en && !en.includes(v)) return `"${key}" must be one of ${en.map(String).join(", ")}`;
  }
  return null;
}

export class McpServer<Ctx = unknown> {
  private tools = new Map<string, ToolDefinition<Ctx>>();

  constructor(public readonly info: McpServerInfo) {}

  tool(def: ToolDefinition<Ctx>) {
    this.tools.set(def.name, def);
    return this;
  }

  listTools() {
    return [...this.tools.values()].map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema,
      ...(annotations && { annotations }),
    }));
  }

  async callTool(name: string, args: unknown, ctx: Ctx): Promise<ToolResult> {
    const def = this.tools.get(name);
    if (!def) throw new RpcError(INVALID_PARAMS, `Unknown tool: ${name}`);
    const problem = validateArgs(def.inputSchema, args);
    if (problem) return errorResult(`Invalid arguments: ${problem}`);
    try {
      const out = await def.handler((args ?? {}) as Record<string, unknown>, ctx);
      if (isToolResult(out)) return out;
      return textResult(out ?? { ok: true });
    } catch (e) {
      return errorResult(describeError(e));
    }
  }

  /** Handle one JSON-RPC message; `null` for notifications (no response). */
  async handleMessage(msg: unknown, ctx: Ctx): Promise<JsonRpcResponse | null> {
    if (!msg || typeof msg !== "object" || (msg as JsonRpcRequest).jsonrpc !== "2.0") {
      return rpcError(null, INVALID_REQUEST, "Invalid JSON-RPC request");
    }
    const req = msg as JsonRpcRequest;
    const isNotification = req.id === undefined;
    if (typeof req.method !== "string") {
      return isNotification ? null : rpcError(req.id ?? null, INVALID_REQUEST, "Missing method");
    }
    if (isNotification) return null; // notifications/initialized, notifications/cancelled, …
    const id = req.id as JsonRpcId;
    try {
      switch (req.method) {
        case "initialize": {
          const requested = String(req.params?.protocolVersion ?? "");
          const protocolVersion = PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : PROTOCOL_VERSIONS[0];
          return ok(id, {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: this.info.name,
              version: this.info.version,
              ...(this.info.title && { title: this.info.title }),
            },
            ...(this.info.instructions && { instructions: this.info.instructions }),
          });
        }
        case "ping":
          return ok(id, {});
        case "tools/list":
          return ok(id, { tools: this.listTools() });
        case "tools/call": {
          const name = req.params?.name;
          if (typeof name !== "string")
            throw new RpcError(INVALID_PARAMS, "params.name is required");
          return ok(id, await this.callTool(name, req.params?.arguments, ctx));
        }
        case "resources/list":
          return ok(id, { resources: [] });
        case "prompts/list":
          return ok(id, { prompts: [] });
        default:
          return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
      }
    } catch (e) {
      if (e instanceof RpcError) return rpcError(id, e.code, e.message);
      return rpcError(id, INTERNAL_ERROR, describeError(e));
    }
  }

  /**
   * The Streamable HTTP endpoint. `authorize` decides whether the request may
   * proceed (the route checks a bearer is present); `ctx` is handed to every tool.
   */
  async handleHttp(
    req: Request,
    ctx: Ctx,
    authorize: (req: Request) => boolean,
  ): Promise<Response> {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({ error: "SSE streams are not offered; POST JSON-RPC messages." }),
        {
          status: 405,
          headers: { "content-type": "application/json", allow: "POST" },
        },
      );
    }
    if (req.method === "DELETE") return new Response(null, { status: 204 });
    if (req.method !== "POST") {
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    }
    if (!authorize(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
      });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(rpcError(null, PARSE_ERROR, "Body is not valid JSON"), 400);
    }
    const messages = Array.isArray(body) ? body : [body];
    // Any bearer passes the gate, so one request must not fan out into many platform calls.
    if (messages.length > 10)
      return json(rpcError(null, INVALID_REQUEST, "At most 10 messages per request"), 400);
    const responses = (await Promise.all(messages.map((m) => this.handleMessage(m, ctx)))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    if (responses.length === 0) return new Response(null, { status: 202 });
    return json(Array.isArray(body) ? responses : responses[0], 200);
  }
}

export class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isToolResult(x: unknown): x is ToolResult {
  return !!x && typeof x === "object" && Array.isArray((x as ToolResult).content);
}

/** Error text safe to show the model: platform bodies, never stack traces or tokens. */
export function describeError(e: unknown): string {
  if (e && typeof e === "object" && "status" in e && "body" in e) {
    const pe = e as { status: number; body: unknown; message: string };
    const body = pe.body;
    const detail =
      body && typeof body === "object"
        ? JSON.stringify(body).slice(0, 600)
        : typeof body === "string"
          ? body.slice(0, 600)
          : pe.message;
    return `Platform request failed (${pe.status}): ${detail}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/** The bearer token on a request, or "". */
export function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : "";
}
