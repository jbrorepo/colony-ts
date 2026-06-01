import React from "react";
import { useShallow } from "zustand/react/shallow";
import { Header } from "../components";
import { useColonyStore } from "../store";

const HeaderPanel = React.memo(function HeaderPanel() {
  // ── Single batched selector (9 individual calls → 1) ──────────────────────
  const {
    sessionId,
    rawCaste,
    provider,
    model,
    selectedProvider,
    selectedModel,
    tokensUsed,
    maxTokens,
    costUsd,
  } = useColonyStore(
    useShallow((state) => ({
      sessionId: state.sessionId,
      rawCaste: state.caste,
      provider: state.provider,
      model: state.model,
      selectedProvider: state.selectedProvider,
      selectedModel: state.selectedModel,
      tokensUsed: state.tokensUsed,
      maxTokens: state.maxTokens,
      costUsd: state.costUsd,
    })),
  );

  return (
    <Header
      sessionId={sessionId}
      caste={String(rawCaste)}
      provider={provider}
      model={model}
      selectedProvider={selectedProvider}
      selectedModel={selectedModel}
      tokensUsed={tokensUsed}
      maxTokens={maxTokens}
      costUsd={costUsd}
    />
  );
});

export default HeaderPanel;
