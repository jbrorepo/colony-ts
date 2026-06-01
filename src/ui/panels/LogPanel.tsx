import React from "react";
import { LogPane } from "../components";
import { useColonyStore } from "../store";

const LogPanel = React.memo(function LogPanel() {
  const messages = useColonyStore((state) => state.messages);
  const logScrollOffset = useColonyStore((state) => state.logScrollOffset);
  return <LogPane messages={messages} maxVisible={25} scrollOffset={logScrollOffset} />;
});

export default LogPanel;
