// Module 2: one tool call in an Ask Copper answer, always open. The top half
// is what Copper sent (the model wrote it); the bottom half is what came back
// (our code worked it out). Layout in specs/module-2/spec.md, section 5.
import { format, parseISO } from "date-fns";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";
import { TOOL_LABELS, type ToolStep } from "@/lib/copper/assistant/progress";

type Row = { label: string; value: string };

const productName = (id: unknown) =>
  getProducts().find((p) => p.id === id)?.name ?? String(id);
const planName = (id: unknown) =>
  getPlans().find((p) => p.id === id)?.name ?? String(id);

/** The tool's input as labelled rows, never raw JSON. */
function sentRows(name: string, input: unknown): Row[] | string {
  if (name === "get_prices") return "Nothing, it just asked for the price list";
  if (name === "get_products")
    return "Nothing, it just asked what Copper sells";
  const values = (input ?? {}) as Record<string, unknown>;
  if (name === "calculate_cost") {
    const products = Array.isArray(values.products) ? values.products : [];
    return [
      {
        label: "Products",
        value: products.length ? products.map(productName).join(", ") : "None",
      },
      { label: "Plan", value: planName(values.plan) },
      { label: "Billing", value: String(values.billing ?? "") },
      { label: "Years", value: String(values.years ?? "") },
    ];
  }
  if (name === "check_availability") {
    return [
      { label: "Product", value: productName(values.product) },
      { label: "Color", value: String(values.color ?? "Every color") },
    ];
  }
  return Object.entries(values).map(([label, value]) => ({
    label,
    value: String(value),
  }));
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type CostOutput = { lines: { item: string; usd: number }[]; totalUsd: number };
type ProductsOutput = {
  products: {
    id: string;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};
type PricesOutput = {
  products: { id: string; name: string; priceUsd: number }[];
  plans: { id: string; name: string; monthlyUsd: number; annualUsd: number }[];
};
type AvailabilityOutput =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: string; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

function StockPill({
  stock,
  restockDate,
}: {
  stock: string;
  restockDate: string | null;
}) {
  if (stock === "in_stock")
    return (
      <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
        In stock
      </span>
    );
  if (stock === "low_stock")
    return (
      <span className="bg-chart-4 text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
        Low stock
      </span>
    );
  const until = restockDate
    ? ` until ${format(parseISO(restockDate), "MMM d, yyyy")}`
    : "";
  return (
    <span className="bg-chart-3 text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
      Back-ordered{until}
    </span>
  );
}

/** What came back, drawn for each tool. */
function CameBack({ name, output }: { name: string; output: unknown }) {
  if (typeof output === "string") return <p>{output}</p>;
  if (name === "calculate_cost") {
    const { lines = [], totalUsd = 0 } = (output ?? {}) as Partial<CostOutput>;
    return (
      <div className="space-y-1">
        {lines.map((line, i) => (
          <div key={i} className="flex justify-between gap-4">
            <span>{line.item}</span>
            <span className="tabular-nums">{formatUsd(line.usd)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t pt-2">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-xl font-bold tabular-nums">
            {formatUsd(totalUsd)}
          </span>
        </div>
      </div>
    );
  }
  if (name === "get_products") {
    const { products = [] } = (output ?? {}) as Partial<ProductsOutput>;
    return (
      <div className="space-y-3">
        {products.map((product) => (
          <div key={product.id}>
            <div className="flex justify-between gap-4 font-medium">
              <span>{product.name}</span>
              <span>{formatUsd(product.priceUsd)}</span>
            </div>
            <p className="text-muted-foreground text-xs">{product.type}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {product.colors.map((color) => (
                <span
                  key={color}
                  className="bg-accent/20 rounded-full px-2 py-0.5 text-xs"
                >
                  {color}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (name === "get_prices") {
    const { products = [], plans = [] } = (output ??
      {}) as Partial<PricesOutput>;
    return (
      <div className="space-y-1">
        {products.map((product) => (
          <div key={product.id} className="flex justify-between gap-4">
            <span>{product.name}</span>
            <span>{formatUsd(product.priceUsd)}</span>
          </div>
        ))}
        {plans
          .filter((plan) => plan.monthlyUsd > 0 || plan.annualUsd > 0)
          .map((plan) => (
            <div key={plan.id} className="flex justify-between gap-4">
              <span>{plan.name}</span>
              <span>
                {formatUsd(plan.monthlyUsd)}/mo · {formatUsd(plan.annualUsd)}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }
  if (name === "check_availability") {
    const result = (output ?? {}) as AvailabilityOutput;
    if (result.status === "not_a_color")
      return (
        <p>
          {result.product} doesn&apos;t come in {result.color}. It comes in{" "}
          {result.colors.join(", ")}.
        </p>
      );
    if (result.status === "unavailable") return <p>{result.message}</p>;
    return (
      <div className="space-y-1">
        {(result.colors ?? []).map((row) => (
          <div
            key={row.color}
            className="flex items-center justify-between gap-4"
          >
            <span>{row.color}</span>
            <StockPill stock={row.stock} restockDate={row.restockDate} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <pre className="text-xs whitespace-pre-wrap">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

export function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  const running = step.state === "calling";
  const sent =
    step.input === undefined && running
      ? null
      : sentRows(step.name, step.input);
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-background overflow-hidden rounded-lg border text-sm"
    >
      <div className="bg-accent text-accent-foreground flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="bg-background/30 rounded px-1.5 text-xs">
          tool {number}
        </span>
        <span className="ml-auto text-xs">
          {TOOL_LABELS[step.name] ?? step.name}
        </span>
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className="text-muted-foreground flex items-center gap-1 text-xs font-semibold tracking-wider uppercase">
          <ArrowRightIcon className="size-3" aria-hidden /> What Copper sent
        </p>
        {sent === null ? (
          <p className="text-muted-foreground italic">
            filling in the details…
          </p>
        ) : typeof sent === "string" ? (
          <p>{sent}</p>
        ) : (
          <RowList rows={sent} />
        )}
      </div>
      <div className="bg-accent/10 space-y-2 border-t px-3 py-3">
        <p className="text-muted-foreground flex items-center gap-1 text-xs font-semibold tracking-wider uppercase">
          <ArrowLeftIcon className="size-3" aria-hidden /> What came back
        </p>
        {running ? (
          <p className="text-muted-foreground flex items-center gap-2">
            <Spinner className="size-3" /> the app is running the code…
          </p>
        ) : (
          <CameBack name={step.name} output={step.output} />
        )}
      </div>
    </div>
  );
}
