import { create } from "zustand";
import { api } from "./api";
import type { Vehicle, GpsDevice, VehicleType } from "./types";

interface AppState {
  vehicles: Vehicle[];
  vehiclesByZone: Record<string, Vehicle[]>;
  devices: GpsDevice[];
  types: VehicleType[];
  loaded: boolean;
  lastLoaded: number;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  loadAll: (force?: boolean, zoneId?: string) => Promise<void>;

  addOrUpdateVehicle: (vehicle: Vehicle) => void;
  removeVehicle: (id: number) => void;
  updateVehicleStatus: (id: number, status: Vehicle["status"]) => void;
  updateDevice: (device: GpsDevice) => void;
  removeDevice: (id: number) => void;
  addType: (type: VehicleType) => void;
}

export const useStore = create<AppState>((set, get) => ({
  vehicles: [],
  vehiclesByZone: {},
  devices: [],
  types: [],
  loaded: false,
  lastLoaded: 0,
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  loadAll: async (force = false) => {
    const now = Date.now();
    const { lastLoaded, loaded } = get();
    
    // If loaded in the last 30 seconds, don't refetch everything unless forced
    if (!force && loaded && now - lastLoaded < 30000) return;

    try {
      const [vRes, dRes, tRes] = await Promise.all([
        api<{ data: Vehicle[] }>("/api/vehicles"),
        api<{ data: GpsDevice[] }>("/api/devices"),
        api<{ data: VehicleType[] }>("/api/vehicle-types")
      ]);
      
      const newVehicles = vRes.data || [];
      set({ 
        vehicles: newVehicles,
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
  removeVehicle: (id) => {
    set((state) => ({
      vehicles: state.vehicles.filter((v) => v.id !== id)
    }));
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
  },
  removeDevice: (id) => {
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== id)
    }));
  },
  addType: (type) => {
    set((state) => ({
      types: [...state.types, type]
    }));
  }
}));
