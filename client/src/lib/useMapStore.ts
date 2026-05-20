import { create } from 'zustand';

export interface MapItem {
  id: string;
  event_id: string;
  lat: number;
  lng: number;
  type: string;
  is_claimed: boolean;
}

interface MapStore {
  mapItems: MapItem[];
  setMapItems: (items: MapItem[]) => void;
  removeMapItem: (id: string) => void;
  addMapItem: (item: MapItem) => void;
  clearMapItems: () => void;
}

export const useMapStore = create<MapStore>((set) => ({
  mapItems: [],
  setMapItems: (items) => set({ mapItems: items }),
  removeMapItem: (id) => set((state) => ({ mapItems: state.mapItems.filter((i) => i.id !== id) })),
  addMapItem: (item) => set((state) => ({
    mapItems: state.mapItems.some((i) => i.id === item.id)
      ? state.mapItems
      : [...state.mapItems, item],
  })),
  clearMapItems: () => set({ mapItems: [] }),
}));
