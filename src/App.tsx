import { AppShell } from "./components/layout/AppShell";
import { SectionRenderer } from "./components/sections";
import { useUIStore } from "./state/store";

function App() {
  const active = useUIStore((s) => s.activeSection);
  return (
    <AppShell>
      <SectionRenderer id={active} />
    </AppShell>
  );
}

export default App;
