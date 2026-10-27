"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { z } from "zod";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, ToolStep } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const SORRY = "Sorry, I couldn't answer that just now. Please try again.";

// A Server Action can be called by anyone, so check the request's shape.
const askCopperRequest = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .min(1)
    .max(50),
  useTools: z.boolean(),
});

/** A copy of the progress, so earlier updates never change underneath the panel. */
function snapshot(progress: Progress): Progress {
  return {
    ...progress,
    steps: progress.steps.map((step) => ({ ...step })),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { messages, useTools } = askCopperRequest.parse(request);
  const live = createLive<Progress>();
  const progress: Progress = { steps: [], reply: "", status: "working" };

  // Tools off means no instructions either: "always use your tools" with no
  // tools makes the model return nothing.
  const result = callStream(
    { module: 2, feature: "ask-copper" },
    useTools
      ? {
          instructions: COPPER_INSTRUCTIONS,
          messages,
          tools: copperTools,
          stopWhen: stepCountIs(MAX_STEPS),
          providerOptions: THOUGHT_SUMMARIES,
        }
      : { messages, providerOptions: THOUGHT_SUMMARIES },
  );

  const toolStep = (id: string) =>
    progress.steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );

  // Read the stream in the background, so the panel gets { progress } now.
  void (async () => {
    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-delta": {
            const last = progress.steps.at(-1);
            if (last?.type === "thinking") last.text += part.text;
            else progress.steps.push({ type: "thinking", text: part.text });
            break;
          }
          case "tool-input-start":
            // The name arrives before the input, so show the step straight away.
            progress.steps.push({
              type: "tool",
              id: part.id,
              name: part.toolName,
              state: "calling",
            });
            break;
          case "tool-call": {
            const step = toolStep(part.toolCallId);
            if (step) step.input = part.input;
            else
              progress.steps.push({
                type: "tool",
                id: part.toolCallId,
                name: part.toolName,
                state: "calling",
                input: part.input,
              });
            break;
          }
          case "tool-result": {
            const step = toolStep(part.toolCallId);
            if (step) {
              step.output = part.output;
              step.state = "done";
            }
            break;
          }
          case "tool-error": {
            const step = toolStep(part.toolCallId);
            if (step) {
              step.output = errorMessage(part.error);
              step.state = "error";
            }
            break;
          }
          case "text-delta":
            progress.reply += part.text;
            break;
          case "error":
            throw part.error;
          default:
            continue;
        }
        live.update(snapshot(progress));
      }
      if (!progress.reply.trim()) progress.reply = SORRY;
      progress.status = "done";
    } catch {
      progress.status = "error";
      if (!progress.reply.trim()) progress.reply = SORRY;
    }
    live.done(snapshot(progress));
  })();

  return { progress: live.live };
}
