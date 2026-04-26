import { createCoffeeAllowedRequest, runLocalAgentPlan } from "./agent-runtime-common";

const run = async (): Promise<void> => {
  const result = await runLocalAgentPlan(createCoffeeAllowedRequest());

  if (result.response.status !== 201 || result.body.allowed !== true) {
    throw new Error(
      result.body.error && typeof result.body.error === "object" && "message" in result.body.error
        ? String(result.body.error.message)
        : "Agent plan was not approved."
    );
  }

  const paylinkId = String(result.body.paylinkId ?? "");
  const paylinkUrl = String(result.body.paylinkUrl ?? "");
  const mirage = (result.body.mirage ?? {}) as { displayCommand?: string };
  const displayCommand = String(mirage.displayCommand ?? "");
  const receipt = result.body.receipt as { type?: string } | undefined;

  if (!paylinkId || !paylinkUrl || !displayCommand || receipt?.type !== "agent-private-receipt") {
    throw new Error("Approved agent plan response is missing paylink or Mirage preview details.");
  }

  console.log("Agent Runtime: Claude + Mirage");
  console.log("Agent: coffee-agent");
  console.log("Task: buy coffee for 5 USDC");
  console.log("Spend request: Approved");
  console.log(`Paylink: ${paylinkId} (${paylinkUrl})`);
  console.log("Mirage command ready");
  console.log(displayCommand);
  console.log("Receipt: available");
  console.log("Payment status: Pending/manual");
  console.log("Execution pending — run Mirage command manually");
};

void run().catch((error: unknown) => {
  console.error("Agent Runtime: Claude + Mirage");
  console.error("Agent: coffee-agent");
  console.error("Task: buy coffee for 5 USDC");
  console.error("Policy: Error");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
