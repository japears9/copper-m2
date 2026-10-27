"use client";

// Module 2: the Ask Copper chat panel. A floating launcher opens a Sheet that
// draws each answer as a line of stations: the tools on offer, Copper's
// thinking, each tool call and the reply. Tools on and tools off are two
// separate chats. Layout in specs/module-2/spec.md, sections 4 and 5.
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  BrainIcon,
  MessageCircleIcon,
  TriangleAlertIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { ToolCard } from "@/components/copper/tool-card";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import {
  TOOL_LABELS,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

const TOOL_NAMES = Object.keys(TOOL_LABELS);

const SORRY = "Sorry, I couldn't answer that just now. Please try again.";

type Turn = { question: string; progress: Progress | null };
type ChatKey = "tools" | "noTools";

/** Renders the **bold** and `code` marks in a thought summary. */
function Markdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, i) => {
        if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4)
          return (
            <strong key={i} className="text-foreground block not-italic">
              {piece.slice(2, -2)}
            </strong>
          );
        if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2)
          return (
            <code key={i} className="font-mono not-italic">
              {piece.slice(1, -1)}
            </code>
          );
        return <span key={i}>{piece}</span>;
      })}
    </>
  );
}

/** One station on the rail: a round node and its contents. */
function Station({
  icon,
  node,
  label,
  children,
}: {
  icon: React.ReactNode;
  node: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pl-9">
      <span
        className={cn(
          "ring-secondary absolute top-0 left-0 flex size-6 items-center justify-center rounded-full ring-4",
          node,
        )}
      >
        {icon}
      </span>
      {label && (
        <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
          {label}
        </p>
      )}
      {children}
    </li>
  );
}

/** The one line that says what Copper is doing right now. */
function nowText(progress: Progress | null, useTools: boolean) {
  if (progress?.reply) return "Writing the answer…";
  if (!useTools) return "Answering from memory…";
  if (progress?.steps.length) return "Deciding what to do next…";
  return "Reading your question…";
}

function Answer({ turn, useTools }: { turn: Turn; useTools: boolean }) {
  const progress = turn.progress;
  const steps = progress?.steps ?? [];
  const working = !progress || progress.status === "working";
  const tools = steps.filter((s): s is ToolStep => s.type === "tool");
  const used = new Set(tools.map((s) => s.name));

  return (
    <div className="space-y-4">
      <ol className="relative space-y-5">
        <span
          aria-hidden
          className={cn(
            "absolute top-3 bottom-3 left-[11px] w-0.5",
            useTools
              ? "bg-linear-to-b from-primary via-accent to-accent"
              : "bg-chart-3",
          )}
        />
        <Station
          icon={<WrenchIcon className="size-3" />}
          node={
            useTools
              ? "bg-accent text-accent-foreground"
              : "bg-chart-3 text-secondary-foreground"
          }
          label={
            useTools ? "Tools Copper can use" : "Tools given to Copper: none"
          }
        >
          <div className="flex flex-wrap gap-1">
            {TOOL_NAMES.map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-xs",
                  !useTools
                    ? "text-muted-foreground line-through"
                    : used.has(name)
                      ? "bg-accent text-accent-foreground font-bold"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools && (
            <p className="text-muted-foreground mt-1 text-xs">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>

        {steps.map((step, i) => {
          if (step.type === "thinking")
            return (
              <Station
                key={i}
                icon={<BrainIcon className="size-3" />}
                node={
                  useTools
                    ? "bg-primary text-primary-foreground"
                    : "bg-chart-3 text-secondary-foreground"
                }
                label="Copper is thinking"
              >
                <p
                  data-testid="thinking"
                  className="text-muted-foreground border-l-2 pl-3 text-sm whitespace-pre-wrap italic"
                >
                  <Markdown text={step.text} />
                </p>
              </Station>
            );
          return (
            <Station
              key={step.id}
              icon={<WrenchIcon className="size-3" />}
              node="bg-accent text-accent-foreground"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={tools.indexOf(step) + 1} />
            </Station>
          );
        })}

        {working && (
          <Station
            icon={
              <span className="flex gap-0.5">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="bg-primary-foreground size-1 animate-bounce rounded-full"
                    style={{ animationDelay: `${dot * 150}ms` }}
                  />
                ))}
              </span>
            }
            node="bg-primary animate-pulse"
          >
            <p className="text-muted-foreground pt-0.5 text-sm">
              {nowText(progress, useTools)}
            </p>
          </Station>
        )}
      </ol>

      {progress?.reply && (
        <div className="bg-background ml-9 rounded-xl rounded-tl-sm border p-3 text-sm shadow-xs">
          <p className="text-primary mb-1 text-xs font-semibold">Copper</p>
          {!useTools && (
            <div className="border-chart-3 mb-2 rounded-md border p-2 text-xs">
              <p className="flex items-center gap-1">
                <TriangleAlertIcon
                  className="text-chart-3 size-3"
                  aria-hidden
                />
                <strong>Answered without tools: may be made up</strong>
              </p>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="whitespace-pre-wrap">
            {progress.reply}
            {working && (
              <span
                aria-hidden
                className="bg-foreground ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle"
              />
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Chat({ useTools }: { useTools: boolean }) {
  const [chats, setChats] = useState<Record<ChatKey, Turn[]>>({
    tools: [],
    noTools: [],
  });
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const key: ChatKey = useTools ? "tools" : "noTools";
  const turns = chats[key];
  const last = turns.at(-1);
  const streaming =
    !!last && (!last.progress || last.progress.status === "working");

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [chats]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || streaming) return;
    const chat = key;
    const index = turns.length;
    // Each chat sends only its own history: questions and finished replies.
    const messages: ChatMessage[] = [
      ...turns.flatMap((turn): ChatMessage[] => [
        { role: "user", content: turn.question },
        ...(turn.progress?.reply
          ? [{ role: "assistant" as const, content: turn.progress.reply }]
          : []),
      ]),
      { role: "user", content: text },
    ];
    const setProgress = (progress: Progress) =>
      setChats((all) => ({
        ...all,
        [chat]: all[chat].map((turn, i) =>
          i === index ? { ...turn, progress } : turn,
        ),
      }));

    setDraft("");
    setChats((all) => ({
      ...all,
      [chat]: [...all[chat], { question: text, progress: null }],
    }));
    try {
      const { progress } = await askCopper({
        messages,
        useTools: chat === "tools",
      });
      for await (const update of readLive(progress)) setProgress(update);
    } catch {
      setProgress({ steps: [], reply: SORRY, status: "error" });
    }
  }

  return (
    <>
      <div className="bg-secondary flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-6">
          {turns.map((turn, i) => (
            <div key={i} className="space-y-4">
              <div className="flex justify-end">
                <p className="bg-primary text-primary-foreground max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-sm">
                  {turn.question}
                </p>
              </div>
              <Answer turn={turn} useTools={useTools} />
            </div>
          ))}
          {!streaming && (
            <div className="space-y-2">
              {turns.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Ask about prices, totals or stock. Try one of these:
                </p>
              )}
              {STARTERS.map((starter) => (
                <Button
                  key={starter}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start text-left whitespace-normal"
                  onClick={() => send(starter)}
                >
                  {starter}
                </Button>
              ))}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>
      <form
        className="bg-background flex items-end gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <textarea
          aria-label="Your question"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
          placeholder="Ask Copper about prices or stock…"
          className="border-input focus-visible:ring-ring/50 max-h-32 min-h-10 flex-1 resize-none rounded-2xl border px-4 py-2 text-sm outline-none focus-visible:ring-3"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          disabled={!draft.trim() || streaming}
          className="bg-primary text-primary-foreground rounded-full"
        >
          <ArrowUpIcon />
        </Button>
      </form>
    </>
  );
}

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);

  // The header link, a click on any #ask link, or arriving at /#ask opens it.
  // Clicking a #ask link when the address already ends in #ask fires no
  // hashchange, so listen for the click too.
  useEffect(() => {
    const openOnHash = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const openOnClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (link?.getAttribute("href")?.endsWith("#ask")) setOpen(true);
    };
    const timer = window.setTimeout(openOnHash, 0);
    window.addEventListener("hashchange", openOnHash);
    document.addEventListener("click", openOnClick);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", openOnHash);
      document.removeEventListener("click", openOnClick);
    };
  }, []);

  return (
    <>
      <Button
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground fixed right-4 bottom-4 z-40 h-12 gap-2 rounded-full px-5 shadow-lg"
      >
        <MessageCircleIcon aria-hidden />
        Ask Copper
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          side="right"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <div className="dark bg-background text-foreground">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <span className="bg-primary flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper the robot mascot"
                  width={40}
                  height={40}
                />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg font-semibold">
                  Ask Copper
                </SheetTitle>
                <SheetDescription>
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close">
                  <XIcon />
                </Button>
              </SheetClose>
            </div>
            {aiConfigured && (
              <div className="bg-foreground/5 flex items-center gap-3 px-4 py-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">Use tools</p>
                  <p className="text-muted-foreground text-xs">
                    {useTools ? "Checks every answer" : "Model guesses alone"}
                  </p>
                </div>
                <Switch
                  aria-label="Use tools"
                  checked={useTools}
                  onCheckedChange={setUseTools}
                />
              </div>
            )}
          </div>
          {aiConfigured ? (
            <Chat useTools={useTools} />
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto px-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
