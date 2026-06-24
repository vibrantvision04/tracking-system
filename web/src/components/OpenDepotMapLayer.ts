import type LType from "leaflet";
import { api } from "@/lib/api";

export interface OpenDepot {
  id: number;
  name: string;
  zone_id: number;
  ward_id: number;
  latitude: number;
  longitude: number;
  radius: number;
  status: string;
  zone_name?: string;
  ward_name?: string;
}

let cachedDepots: OpenDepot[] | null = null;
let isFetching = false;
const pendingResolvers: ((depots: OpenDepot[]) => void)[] = [];

export async function fetchOpenDepots(): Promise<OpenDepot[]> {
  if (cachedDepots) return cachedDepots;

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("cached_open_depots");
      if (stored) {
        cachedDepots = JSON.parse(stored);
        backgroundRefresh();
        return cachedDepots!;
      }
    } catch (e) {
      console.warn("Failed to parse cached open depots", e);
    }
  }

  if (isFetching) {
    return new Promise((resolve) => {
      pendingResolvers.push(resolve);
    });
  }

  isFetching = true;
  try {
    const res = await api<{ success: boolean; data: OpenDepot[] }>("/api/open-depots");
    if (res.success && res.data) {
      cachedDepots = res.data;
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_open_depots", JSON.stringify(res.data));
      }
    }
  } catch (err) {
    console.error("Failed to load open depots:", err);
  } finally {
    isFetching = false;
    const depots = cachedDepots || [];
    pendingResolvers.forEach((resolve) => resolve(depots));
    pendingResolvers.length = 0;
  }

  return cachedDepots || [];
}

async function backgroundRefresh() {
  if (isFetching) return;
  isFetching = true;
  try {
    const res = await api<{ success: boolean; data: OpenDepot[] }>("/api/open-depots");
    if (res.success && res.data) {
      cachedDepots = res.data;
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_open_depots", JSON.stringify(res.data));
      }
    }
  } catch (err) {
    console.error("Failed to background refresh open depots:", err);
  } finally {
    isFetching = false;
  }
}

export async function populateOpenDepotLayer(L: typeof LType, layerGroup: LType.LayerGroup) {
  try {
    const depots = await fetchOpenDepots();
    layerGroup.clearLayers();

    const openDepotIcon = L.divIcon({
      className: "open-depot-marker",
      html: `
        <div style="
          background-color: #475569; 
          width: 28px; 
          height: 28px; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          border: 2px solid white; 
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    depots.forEach((d) => {
      if (!d.latitude || !d.longitude || isNaN(d.latitude) || isNaN(d.longitude)) return;

      const marker = L.marker([d.latitude, d.longitude], { icon: openDepotIcon });
      
      const popupContent = `
        <div class="p-2.5 text-xs text-slate-800 font-sans min-w-[180px]">
          <div class="border-b border-slate-100 pb-1 mb-1.5 flex items-center gap-1.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            <div>
              <h3 class="font-bold text-slate-900" style="margin: 0; font-size: 12px; line-height: 1.2;">${d.name}</h3>
              <span class="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Open Depot</span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-x-2 gap-y-1">
            <span class="text-slate-400 font-medium">ID:</span>
            <span class="font-mono text-right">${d.id}</span>
            <span class="text-slate-400 font-medium">Zone:</span>
            <span class="font-semibold text-right">${d.zone_name || "N/A"}</span>
            <span class="text-slate-400 font-medium">Ward:</span>
            <span class="font-semibold text-right">${d.ward_name || "N/A"}</span>
            <span class="text-slate-400 font-medium">Latitude:</span>
            <span class="font-mono text-right text-[10px]">${d.latitude.toFixed(6)}</span>
            <span class="text-slate-400 font-medium">Longitude:</span>
            <span class="font-mono text-right text-[10px]">${d.longitude.toFixed(6)}</span>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.addTo(layerGroup);
    });
  } catch (err) {
    console.error("Failed to populate open depot layer:", err);
  }
}
