'use client';

import { create } from 'zustand';

// Transient client UI state — selected node, panel open/closed, filter selections,
// camera pose. Per PRD FR-2.13 filter selections persist for the session;
// session-storage persistence is wired in a later story when filters land.
//
// SSR note: Zustand stores created at module scope are process-wide singletons.
// This is safe today because no Server Component reads from this store — the
// store is only touched by client-side ('use client') consumers. If per-user
// state ever needs to be hydrated from the server, switch to the createStore +
// useStore(context) pattern (Zustand v5 SSR guide).
export type UIState = {
  selectedEmployeeId: string | null;
  detailPanelOpen: boolean;
  setSelectedEmployee: (id: string | null) => void;
  setDetailPanelOpen: (open: boolean) => void;
  closeDetailPanel: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  selectedEmployeeId: null,
  detailPanelOpen: false,
  // Independent setters — callers compose. Selecting an employee does NOT
  // implicitly open the panel; the panel open state is its own concern.
  setSelectedEmployee: (id) => set({ selectedEmployeeId: id }),
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),
  // Convenience helper for the common close-and-clear case.
  closeDetailPanel: () => set({ selectedEmployeeId: null, detailPanelOpen: false }),
}));
