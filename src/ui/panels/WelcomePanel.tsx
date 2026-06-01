import React from "react";
import { useShallow } from "zustand/react/shallow";
import { WelcomeBanner } from "../components";
import { useColonyStore } from "../store";

const WelcomePanel = React.memo(function WelcomePanel() {
  const { hasMessages, caste, memoryTruthModeOverride } = useColonyStore(
    useShallow((state) => ({
      hasMessages: state.messages.length > 0,
      caste: String(state.caste),
      memoryTruthModeOverride: state.memoryTruthModeOverride,
    })),
  );

  if (hasMessages) return null;
  return <WelcomeBanner caste={caste} memoryTruthModeOverride={memoryTruthModeOverride} />;
});

export default WelcomePanel;
