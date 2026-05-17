export interface TraceToolCall {
  tool: string;
  args: Record<string, unknown>;
  mutating?: boolean;
}

export interface TraceAttempt {
  attempt: number;
  status: "failed" | "succeeded";
  calls: TraceToolCall[];
}

export interface TraceToSkillProposalInput {
  skillName: string;
  transcriptRef: string;
  attempts: TraceAttempt[];
}

export interface TraceToSkillProposal {
  status: "proposal";
  inert: true;
  skillName: string;
  transcriptRef: string;
  finalAttempt: number;
  calls: TraceToolCall[];
  approvalClassification: string[];
  markdown: string;
}

export function buildTraceToSkillProposal(input: TraceToSkillProposalInput): TraceToSkillProposal {
  const final = [...input.attempts]
    .filter((attempt) => attempt.status === "succeeded")
    .sort((left, right) => right.attempt - left.attempt)[0];
  const calls = final?.calls.map((call) => ({ ...call, args: { ...call.args } })) ?? [];
  const hasMutatingTrace = calls.some((call) => call.mutating);
  const approvalClassification = hasMutatingTrace
    ? ["high-risk:mutating-trace", "requires-promotion-review"]
    : ["review-required", "read-only-trace"];
  const lines = [
    `# Skill Proposal: ${input.skillName}`,
    "",
    "Promotion status: not promoted",
    "This proposal is inert and writes no SKILL.md file.",
    `Transcript reference: ${input.transcriptRef}`,
    `Final attempt: ${final?.attempt ?? "none"}`,
    `Approval classification: ${approvalClassification.join(", ")}`,
    "",
    "## Tool Trace",
    ...calls.map((call, index) => `${index + 1}. ${call.tool} | mutating ${call.mutating ? "yes" : "no"} | args ${JSON.stringify(call.args)}`),
    "",
    "Exact transcript truth remains canonical; this proposal is derived review material.",
  ];
  return {
    status: "proposal",
    inert: true,
    skillName: input.skillName,
    transcriptRef: input.transcriptRef,
    finalAttempt: final?.attempt ?? 0,
    calls,
    approvalClassification,
    markdown: lines.join("\n"),
  };
}
