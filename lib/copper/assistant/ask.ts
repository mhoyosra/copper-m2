"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, Step } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const APOLOGY = "Sorry, I couldn't answer that. Please try again.";

/** A copy that shares nothing with the steps Copper is still changing. */
function snapshot(steps: Step[], reply: string, status: Progress["status"]) {
  return {
    steps: steps.map((step) => ({ ...step })),
    reply,
    status,
  } satisfies Progress;
}

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { messages, useTools } = request;
  const { live, update, done } = createLive<Progress>();

  const steps: Step[] = [];
  let reply = "";
  const send = () => update(snapshot(steps, reply, "working"));

  const toolStep = (id: string) =>
    steps.find((s) => s.type === "tool" && s.id === id);

  // Read the stream in the background, so the panel gets this live value now.
  void (async () => {
    try {
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        {
          messages,
          providerOptions: THOUGHT_SUMMARIES,
          // With tools off the model gets no instructions and no tools, so
          // it answers from memory alone.
          ...(useTools && {
            instructions: COPPER_INSTRUCTIONS,
            tools: copperTools,
            stopWhen: stepCountIs(MAX_STEPS),
          }),
        },
      );

      for await (const part of result.fullStream) {
        if (part.type === "reasoning-delta") {
          const last = steps.at(-1);
          if (last?.type === "thinking") last.text += part.text;
          else steps.push({ type: "thinking", text: part.text });
        } else if (part.type === "tool-input-start") {
          steps.push({
            type: "tool",
            id: part.id,
            name: part.toolName,
            state: "calling",
          });
        } else if (part.type === "tool-call") {
          const step = toolStep(part.toolCallId);
          if (step?.type === "tool") step.input = part.input;
        } else if (part.type === "tool-result") {
          const step = toolStep(part.toolCallId);
          if (step?.type === "tool") {
            step.output = part.output;
            step.state = "done";
          }
        } else if (part.type === "tool-error") {
          const step = toolStep(part.toolCallId);
          if (step?.type === "tool") {
            step.output =
              part.error instanceof Error
                ? part.error.message
                : String(part.error);
            step.state = "error";
          }
        } else if (part.type === "text-delta") {
          reply += part.text;
        } else if (part.type === "error") {
          throw part.error;
        } else {
          continue;
        }
        send();
      }

      // A normal finish with no words still gets an answer.
      done(snapshot(steps, reply === "" ? APOLOGY : reply, "done"));
    } catch (cause) {
      console.error(
        "[ask-copper]",
        cause instanceof Error ? cause.message : cause,
      );
      done(snapshot(steps, reply === "" ? APOLOGY : reply, "error"));
    }
  })();

  return { progress: live };
}
