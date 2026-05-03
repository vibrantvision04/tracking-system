import { create } from "zustand";
import { api } from "./api";
import type { Vehicle, GpsDevice, VehicleType } from "./types";

interface AppState {
  vehicles: Vehicle[];
  devices: GpsDevice[];
  types: VehicleType[];
  loaded: boolean;
  loadAll: () => Promise<void>;
  updateVehicleStatus: (id: number, status: string) => void;
  updateDevice: (device: GpsDevice) => void;
}

export const useStore = create<AppState>((set, get) => ({
  vehicles: [],
  devices: [],
  types: [],
  loaded: false,
  loadAll: async () => {
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
        loaded: true 
      });
    } catch (err) {
      console.error("Failed to load initial data", err);
    }
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
