"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

interface ParkingSpot { id: number; name: string; }
interface Region { id: number; region_name: string; region_type_id: number; parent_id?: number | null; }
interface Assignment { id: number; parking_spot_id: number; parking_spot: string; region_id: number; region_name: string; }

export default function ParkingSpotZonePage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [wards, setWards] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [spotSearch, setSpotSearch] = useState("");
  const [zoneSearch, setZoneSearch] = useState("");
  const [wardSearch, setWardSearch] = useState("");
  const [spotDropdownOpen, setSpotDropdownOpen] = useState(false);
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);
  const spotRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const wardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (spotRef.current && !spotRef.current.contains(e.target as Node)) setSpotDropdownOpen(false);
      if (zoneRef.current && !zoneRef.current.contains(e.target as Node)) setZoneDropdownOpen(false);
      if (wardRef.current && !wardRef.current.contains(e.target as Node)) setWardDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assignRes, spotRes, regRes] = await Promise.all([
        api<{ data: Assignment[] }>("/api/parking-spot-zones"),
        api<{ data: ParkingSpot[] }>("/api/parking-spots"),
        api<{ data: Region[] }>("/api/regions")
      ]);
      setAssignments(assignRes.data || []);
      setSpots(spotRes.data || []);
      const allRegions = regRes.data || [];
      setZones(allRegions.filter(r => r.region_type_id === 2));
      setWards(allRegions.filter(r => r.region_type_id === 3));
    } catch { toast.error("Failed to load data."); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setSelectedWardId(null); }, [selectedZoneId]);

  const closeForm = () => { setFormOpen(false); setSelectedSpotId(null); setSelectedZoneId(null); setSelectedWardId(null); setSpotSearch(""); setZoneSearch(""); setWardSearch(""); };

  const handleSubmit = async () => {
    if (!selectedSpotId || !selectedZoneId) { toast.warning("Parking Spot and Zone are required."); return; }
    setSubmitting(true);
    try {
      await post("/api/parking-spot-zones", { parking_spot_id: selectedSpotId, region_id: selectedWardId || selectedZoneId });
      toast.success("Assigned successfully!"); closeForm(); loadData();
    } catch { toast.error("Failed to assign parking spot."); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (a: Assignment) => {
    try { await del(`/api/parking-spot-zones/${a.id}`); toast.success("Removed assignment."); loadData(); }
    catch { toast.error("Failed to remove assignment."); }
  };

  const filteredSpots = spots.filter(s => s.name.toLowerCase().includes(spotSearch.toLowerCase()));
  const filteredZones = zones.filter(z => z.region_name.toLowerCase().includes(zoneSearch.toLowerCase()));
  const applicableWards = wards.filter(w => !selectedZoneId || w.parent_id === selectedZoneId);
  const filteredWards = applicableWards.filter(w => w.region_name.toLowerCase().includes(wardSearch.toLowerCase()));
  const selectedSpotName = spots.find(s => s.id === selectedSpotId)?.name || "Select Parking Spot";
  const selectedZoneName = zones.find(z => z.id === selectedZoneId)?.region_name || "Select Zone";
  const selectedWardName = wards.find(w => w.id === selectedWardId)?.region_name || "Select Ward";

  const SearchableDropdown = ({ label, required, selectedName, isSelected, isOpen, setOpen, search, setSearch, items, onSelect, disabled }: any) => (
    <div className="flex flex-col relative" ref={label === "Parking Spot" ? spotRef : label === "Zone" ? zoneRef : wardRef}>
      <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">{label} {required && <span className="text-red-400">*</span>}</span>
      <div className={`bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() => { if (!disabled) setOpen(!isOpen); }}>
        <span className={isSelected ? "text-theme-text font-medium" : "text-theme-text-dim"}>{selectedName}</span>
        <span className="text-theme-text-dim text-xs">▼</span>
      </div>
      {isOpen && !disabled && (
        <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
          <div className="p-2 border-b border-theme-border"><input type="text" placeholder={`🔍 Search ${label}...`} value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent text-sm text-theme-text outline-none placeholder:text-theme-text-dim" autoFocus /></div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {label === "Ward" && (
              <div className="px-4 py-2 text-sm text-theme-text-dim hover:bg-theme-base italic cursor-pointer transition" onClick={() => { onSelect(null); }}>None (Assign to Zone)</div>
            )}
            {items.map((item: any) => (
              <div key={item.id} className="px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition" onClick={() => onSelect(item.id)}>
                {item.name || item.region_name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Parking Spot to Zone Assignment"
        description="Map parking spots to zones and wards for geographic organization."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Parking Spot-Zone" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Assign Parking Spot"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {formOpen && (
          <Card className="animate-fade-in relative z-20">
            <CardHeader>
              <CardTitle>Assign Parking Spot to Zone</CardTitle>
              <CardDescription>Select a parking spot, zone, and optionally a ward.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <SearchableDropdown label="Parking Spot" required selectedName={selectedSpotName} isSelected={!!selectedSpotId} isOpen={spotDropdownOpen} setOpen={setSpotDropdownOpen} search={spotSearch} setSearch={setSpotSearch} items={filteredSpots} onSelect={(id: number) => { setSelectedSpotId(id); setSpotDropdownOpen(false); setSpotSearch(""); }} />
                <SearchableDropdown label="Zone" required selectedName={selectedZoneName} isSelected={!!selectedZoneId} isOpen={zoneDropdownOpen} setOpen={setZoneDropdownOpen} search={zoneSearch} setSearch={setZoneSearch} items={filteredZones} onSelect={(id: number) => { setSelectedZoneId(id); setZoneDropdownOpen(false); setZoneSearch(""); }} />
                <SearchableDropdown label="Ward" selectedName={selectedWardName} isSelected={!!selectedWardId} isOpen={wardDropdownOpen} setOpen={setWardDropdownOpen} search={wardSearch} setSearch={setWardSearch} items={filteredWards} disabled={!selectedZoneId} onSelect={(id: number | null) => { setSelectedWardId(id); setWardDropdownOpen(false); setWardSearch(""); }} />
              </div>
              <div className="flex gap-3 pt-4 border-t border-theme-border">
                <Button onClick={handleSubmit} variant="accent" loading={submitting} loadingText="Submitting...">Submit</Button>
                <Button onClick={closeForm} variant="outline">Close</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Parking Spot Assignments</CardTitle><CardDescription>All parking spot to zone/ward mappings.</CardDescription></div>
            <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">{assignments.length} total</span>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[<div key="s" className="text-center w-16">S. No.</div>, "Parking Spot", "Region", <div key="a" className="text-right pr-4 w-24">Action</div>]}
                isLoading={loading}
                emptyState="No parking spots assigned to any zones."
              >
                {assignments.map((a, idx) => (
                  <tr key={a.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-3 px-5 font-semibold text-theme-text">{a.parking_spot}</td>
                    <td className="py-3 px-5 text-theme-text-dim">{a.region_name}</td>
                    <td className="py-3 px-5 text-right">
                      <DeleteButton onDelete={() => handleDelete(a)} confirmMessage={`Remove assignment for ${a.parking_spot}?`} />
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
