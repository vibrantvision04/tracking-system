"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

interface TransferStation {
  id: number;
  name: string;
}

interface Region {
  id: number;
  region_name: string;
  region_type_id: number;
}

interface TransferStationWard {
  id: number;
  transfer_station_id: number;
  transfer_station_name: string;
  ward_id: number;
  ward_name: string;
}

export default function TransferStationWardPage() {
  const [mappings, setMappings] = useState<TransferStationWard[]>([]);
  const [stations, setStations] = useState<TransferStation[]>([]);
  const [wards, setWards] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);

  const [stationSearch, setStationSearch] = useState("");
  const [wardSearch, setWardSearch] = useState("");

  const [stationDropdownOpen, setStationDropdownOpen] = useState(false);
  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);

  const [tableFilter, setTableFilter] = useState("");

  const stationRef = useRef<HTMLDivElement>(null);
  const wardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (stationRef.current && !stationRef.current.contains(e.target as Node)) {
        setStationDropdownOpen(false);
      }
      if (wardRef.current && !wardRef.current.contains(e.target as Node)) {
        setWardDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tswRes, tsRes, regRes] = await Promise.all([
        api<{ data: TransferStationWard[] }>("/api/transfer-station-wards"),
        api<{ data: TransferStation[] }>("/api/transfer-stations"),
        api<{ data: Region[] }>("/api/regions")
      ]);
      setMappings(tswRes.data || []);
      setStations(tsRes.data || []);
      setWards((regRes.data || []).filter(r => r.region_type_id === 3));
    } catch {
      toast.error("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const closeForm = () => {
    setFormOpen(false);
    setSelectedStationId(null);
    setSelectedWardId(null);
    setStationSearch("");
    setWardSearch("");
  };

  const handleSubmit = async () => {
    if (!selectedStationId || !selectedWardId) {
      toast.warning("Both Transfer Station and Ward must be selected.");
      return;
    }
    setSubmitting(true);
    try {
      await post("/api/transfer-station-wards", {
        transfer_station_id: selectedStationId,
        ward_id: selectedWardId
      });
      toast.success("Assigned successfully!");
      closeForm();
      loadData();
    } catch {
      toast.error("Failed to assign transfer station to ward.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (mapping: TransferStationWard) => {
    try {
      await del(`/api/transfer-station-wards/${mapping.id}`);
      toast.success("Removed assignment.");
      loadData();
    } catch {
      toast.error("Failed to remove assignment.");
    }
  };

  const filteredMappings = mappings.filter(m => {
    const search = tableFilter.toLowerCase();
    return (
      m.transfer_station_name?.toLowerCase().includes(search) ||
      m.ward_name?.toLowerCase().includes(search)
    );
  });

  const filteredStations = stations.filter(s =>
    s.name.toLowerCase().includes(stationSearch.toLowerCase())
  );

  const filteredWards = wards.filter(w =>
    w.region_name.toLowerCase().includes(wardSearch.toLowerCase())
  );

  const selectedStationName = stations.find(s => s.id === selectedStationId)?.name || "Select Transfer Station";
  const selectedWardName = wards.find(w => w.id === selectedWardId)?.region_name || "Select Ward";

  const SearchableDropdown = ({ label, required, selectedName, isSelected, isOpen, setOpen, search, setSearch, items, onSelect }: any) => {
    const ref = label === "Transfer Station" ? stationRef : wardRef;
    return (
      <div className="flex flex-col relative" ref={ref}>
        <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
          {label} {required && <span className="text-red-400">*</span>}
        </span>
        <div
          className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition"
          onClick={() => setOpen(!isOpen)}
        >
          <span className={isSelected ? "text-theme-text font-medium" : "text-theme-text-dim"}>{selectedName}</span>
          <span className="text-theme-text-dim text-xs">▼</span>
        </div>
        {isOpen && (
          <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
            <div className="p-2 border-b border-theme-border">
              <input
                type="text"
                placeholder={`🔍 Search ${label}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-theme-text outline-none placeholder:text-theme-text-dim"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {items.map((item: any) => (
                <div
                  key={item.id}
                  className="px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition"
                  onClick={() => onSelect(item.id)}
                >
                  {item.name || item.region_name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Transfer Station To Ward"
        description="Map transfer stations to their corresponding wards."
        breadcrumbs={[{ label: "SWIFT", href: "/swift/shift" }, { label: "Transfer Station-Ward" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Assign Transfer Station To Ward"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {formOpen && (
          <Card className="animate-fade-in relative z-20 !overflow-visible">
            <CardHeader>
              <CardTitle>Assign Transfer Station to Ward</CardTitle>
              <CardDescription>Select a transfer station and ward to create a mapping.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <SearchableDropdown
                  label="Transfer Station"
                  required
                  selectedName={selectedStationName}
                  isSelected={!!selectedStationId}
                  isOpen={stationDropdownOpen}
                  setOpen={setStationDropdownOpen}
                  search={stationSearch}
                  setSearch={setStationSearch}
                  items={filteredStations}
                  onSelect={(id: number) => {
                    if (selectedStationId === id) {
                      setSelectedStationId(null);
                    } else {
                      setSelectedStationId(id);
                    }
                    setStationDropdownOpen(false);
                    setStationSearch("");
                  }}
                />
                <SearchableDropdown
                  label="Ward"
                  required
                  selectedName={selectedWardName}
                  isSelected={!!selectedWardId}
                  isOpen={wardDropdownOpen}
                  setOpen={setWardDropdownOpen}
                  search={wardSearch}
                  setSearch={setWardSearch}
                  items={filteredWards}
                  onSelect={(id: number) => {
                    if (selectedWardId === id) {
                      setSelectedWardId(null);
                    } else {
                      setSelectedWardId(id);
                    }
                    setWardDropdownOpen(false);
                    setWardSearch("");
                  }}
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-theme-border">
                <Button onClick={handleSubmit} variant="accent" loading={submitting} loadingText="Submitting...">
                  Submit
                </Button>
                <Button onClick={closeForm} variant="outline">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Transfer Station-Ward Assignments</CardTitle>
              <CardDescription>All mappings between transfer stations and wards.</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Filter..."
                value={tableFilter}
                onChange={e => setTableFilter(e.target.value)}
                className="bg-theme-surface border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-text placeholder:text-theme-text-dim focus:border-emerald-500 outline-none transition font-semibold"
              />
              <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">
                {mappings.length} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. NO.</div>,
                  "TRANSFER STATION(S)",
                  "WARD",
                  <div key="a" className="text-right pr-4 w-24">ACTION</div>
                ]}
                isLoading={loading}
                emptyState="No data to display"
              >
                {filteredMappings.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-semibold text-theme-text">
                      {m.transfer_station_name}
                    </td>
                    <td className="py-3 px-5 text-theme-text-dim">
                      {m.ward_name}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <DeleteButton
                        onDelete={() => handleDelete(m)}
                        confirmMessage={`Remove assignment for ${m.transfer_station_name}?`}
                      />
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
