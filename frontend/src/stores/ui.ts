import { create } from "zustand";

interface UiState {
  /** Bumped whenever documents change, so open pages refetch. */
  libraryVersion: number;
  uploadOpen: boolean;
  /** Extra breadcrumb label for the current page, such as the open paper title. */
  crumb: string | null;
  maxUploadMb: number;
  bumpLibrary: () => void;
  setUploadOpen: (open: boolean) => void;
  setCrumb: (crumb: string | null) => void;
  setMaxUploadMb: (mb: number) => void;
}

export const useUi = create<UiState>()((set) => ({
  libraryVersion: 0,
  uploadOpen: false,
  crumb: null,
  maxUploadMb: 20,
  bumpLibrary: () => set((state) => ({ libraryVersion: state.libraryVersion + 1 })),
  setUploadOpen: (uploadOpen) => set({ uploadOpen }),
  setCrumb: (crumb) => set({ crumb }),
  setMaxUploadMb: (maxUploadMb) => set({ maxUploadMb }),
}));
