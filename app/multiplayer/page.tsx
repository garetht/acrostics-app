import { Suspense } from "react";

import { MultiplayerRoute } from "../multiplayer-route";
import { RouteStatusScreen } from "../route-status-screen";

export default function MultiplayerPage() {
  return (
    <Suspense
      fallback={
        <RouteStatusScreen
          body="Loading the selected puzzle and preparing the multiplayer session."
          eyebrow="Multiplayer"
          title="Loading session"
        />
      }
    >
      <MultiplayerRoute />
    </Suspense>
  );
}
