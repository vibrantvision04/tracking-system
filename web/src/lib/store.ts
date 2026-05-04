import { create } from "zustand";
import { api } from "./api";
import type { Vehicle, GpsDevice, VehicleType } from "./types";

interface AppState {
  vehicles: Vehicle[];
  devices: GpsDevice[];
  types: VehicleType[];
  loaded: boolean;
  lastLoaded: number;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  loadAll: () => Promise<void>;

  addOrUpdateVehicle: (vehicle: Vehicle) => void;
  updateVehicleStatus: (id: number, status: Vehicle["status"]) => void;
  updateDevice: (device: GpsDevice) => void;
}

export const useStore = create<AppState>((set, get) => ({
  vehicles: [],
  devices: [],
  types: [],
  loaded: false,
  lastLoaded: 0,
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  loadAll: async () => {
    const now = Date.now();
    const { lastLoaded, loaded } = get();
    
    // If loaded in the last 30 seconds, don't refetch everything
    if (loaded && now - lastLoaded < 30000) return;

    try {
      const [vRes, dRes, tRes] = await Promise.all([
        api<{ data: Vehicle[] }>("/api/vehicles"),
        api<{ data: GpsDevice[] }>("/api/devices"),
        api<{ data: VehicleType[] }>("/api/vehicle-types")
      ]);
      set({ 
        vehicles: vRes.data || [], 
        devices: dRes.data || [], 
        types: tRes.data || [], 
        loaded: true,
        lastLoaded: now
      });
    } catch (err) {
      console.error("Failed to load initial data", err);
    }
  },
  addOrUpdateVehicle: (vehicle: Vehicle) => {
    set((state) => {
      const exists = state.vehicles.find(v => v.id === vehicle.id);
      if (exists) {
        return { vehicles: state.vehicles.map(v => v.id === vehicle.id ? vehicle : v) };
      }
      return { vehicles: [...state.vehicles, vehicle] };
    });
  },
  updateVehicleStatus: (id, status) => {
    set((state) => ({
      vehicles: state.vehicles.map((v) => v.id === id ? { ...v, status } : v)
    }));
  },
  updateDevice: (device) => {
    set((state) => {
      const exists = state.devices.find(d => d.id === device.id);
      if (exists) {
        return { devices: state.devices.map(d => d.id === device.id ? device : d) };
      }
      return { devices: [...state.devices, device] };
    });
  }
}));
