import { Suspense } from "react";

import { AcrosticsArchiveRoute } from "./acrostics-archive-route";
import { RouteStatusScreen } from "./route-status-screen";

export default function Home() {
  return (
    <Suspense
      fallback={
        <RouteStatusScreen
          body="Loading the archived acrostics and your selected puzzle."
          eyebrow="Archive"
          title="Loading acrostics"
        />
      }
    >
      <AcrosticsArchiveRoute />
    </Suspense>
  );
}
