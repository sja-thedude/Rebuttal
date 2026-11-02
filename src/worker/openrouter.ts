export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export async function chat(key: string, model: string, messages: ChatMessage[], tools: ToolDef[]): Promise<ChatMessage> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rebuttal.sjapathway.workers.dev",
      "X-Title": "Rebuttal",
    },
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: 1800 }),
  });
  if (!res.ok) throw new Error(`Model request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices?: { message: ChatMessage }[]; error?: { message: string } };
  if (!body.choices?.[0]) throw new Error(body.error?.message ?? "Model returned no answer");
  return body.choices[0].message;
}
