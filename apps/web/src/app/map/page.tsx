// Placeholder /map page for Story 1-3. The real 3D Career Map (R3F scene, instanced
// employee nodes, LOD, BVH raycasting) lands in EPIC-11. This page exists so the
// root redirect (`/` -> `/map` when authenticated) has a valid target.

export default function MapPage(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Career Map</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The 3D Career Map renders here once EPIC-11 (R3F scene, instanced nodes, LOD, BVH raycasting) lands.
      </p>
    </main>
  );
}
