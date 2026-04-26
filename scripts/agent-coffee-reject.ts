import { createCoffeeRejectedRequest, runLocalAgentPlan } from "./agent-runtime-common";

const run = async (): Promise<void> => {
  const result = await runLocalAgentPlan(createCoffeeRejectedRequest());

  const reason = String(result.body.reason ?? "");
  const receipt = result.body.receipt as { type?: string; decision?: string } | undefined;

  if (result.response.status !== 200 || result.body.allowed !== false || !reason || receipt?.type !== "agent-policy-decision" || receipt.decision !== "rejected") {
    throw new Error(
      result.body.error && typeof result.body.error === "object" && "message" in result.body.error
        ? String(result.body.error.message)
        : "Agent plan rejection flow did not behave as expected."
    );
  }

  console.log("Agent Runtime: Claude + Mirage");
  console.log("Agent: coffee-agent");
  console.log("Task: buy expensive gear for 100 USDC");
  console.log("Spend request: Rejected");
  console.log(`Reason: ${reason}`);
  console.log("Receipt: rejected");
  console.log("Private spend: none");
  console.log("Mirage command: not generated");
};

void run().catch((error: unknown) => {
  console.error("Agent Runtime: Claude + Mirage");
  console.error("Agent: coffee-agent");
  console.error("Task: buy expensive gear for 100 USDC");
  console.error("Policy: Error");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
