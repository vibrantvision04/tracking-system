"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";
import { Card, CardContent } from "@/components/ui/Card";
import SearchableDropdown from "@/components/shared/SearchableDropdown";

interface GTSTripRow {
	vehicle_id: number;
	registration_no: string;
	zone_name: string;
	ward_name: string;
	trip_count: number;
	rejected_count: number;
	rejection_reasons: string[];
}

export default function GTSTripReportPage() {
	const [data, setData] = useState<GTSTripRow[]>([]);
	const [loading, setLoading] = useState(false);

	// Dropdown option lists
	const [zones, setZones] = useState<any[]>([]);
	const [wards, setWards] = useState<any[]>([]);
	const [routeTypes, setRouteTypes] = useState<any[]>([]);
	const [vehicles, setVehicles] = useState<any[]>([]);

	const [zoneSearch, setZoneSearch] = useState("");
	const [wardSearch, setWardSearch] = useState("");
	const [routeTypeSearch, setRouteTypeSearch] = useState("");
	const [vehicleSearch, setVehicleSearch] = useState("");

	const [zoneOpen, setZoneOpen] = useState(false);
	const [wardOpen, setWardOpen] = useState(false);
	const [routeTypeOpen, setRouteTypeOpen] = useState(false);
	const [vehicleOpen, setVehicleOpen] = useState(false);

	const zoneRef = useRef<HTMLDivElement>(null);
	const wardRef = useRef<HTMLDivElement>(null);
	const routeTypeRef = useRef<HTMLDivElement>(null);
	const vehicleRef = useRef<HTMLDivElement>(null);

	// Filter states
	const [selectedZone, setSelectedZone] = useState("");
	const [selectedWard, setSelectedWard] = useState("");
	const [selectedRouteType, setSelectedRouteType] = useState("");
	const [selectedVehicle, setSelectedVehicle] = useState("");
	const [selectedDate, setSelectedDate] = useState<string>(() => {
		const today = new Date();
		return today.toISOString().split("T")[0];
	});

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (zoneRef.current && !zoneRef.current.contains(e.target as Node)) setZoneOpen(false);
			if (wardRef.current && !wardRef.current.contains(e.target as Node)) setWardOpen(false);
			if (routeTypeRef.current && !routeTypeRef.current.contains(e.target as Node)) setRouteTypeOpen(false);
			if (vehicleRef.current && !vehicleRef.current.contains(e.target as Node)) setVehicleOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Fetch option lists on mount
	useEffect(() => {
		api("/api/zones")
			.then((d: any) => d.success && setZones(d.data || []))
			.catch(console.error);
		api("/api/wards")
			.then((d: any) => d.success && setWards(d.data || []))
			.catch(console.error);
		api("/api/route-types")
			.then((d: any) => d.success && setRouteTypes(d.data || []))
			.catch(console.error);
		api("/api/vehicles")
			.then((d: any) => d.success && setVehicles(d.data || []))
			.catch(console.error);
	}, []);

	const loadReport = async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams();
			if (selectedDate) params.append("date", selectedDate);
			if (selectedZone) params.append("zone_id", selectedZone);
			if (selectedWard) params.append("ward_id", selectedWard);
			if (selectedRouteType) params.append("route_type_id", selectedRouteType);
			if (selectedVehicle) params.append("vehicle_id", selectedVehicle);

			const res = await api<{ success: boolean; data: GTSTripRow[] }>(
				`/api/reports/gts-trips?${params.toString()}`
			);
			if (res.success && res.data) {
				setData(res.data);
				toast.success("Data loaded successfully!");
			} else {
				setData([]);
			}
		} catch (err) {
			console.error(err);
			toast.error("Failed to load report data.");
		} finally {
			setLoading(false);
		}
	};

	const handleExportCSV = () => {
		if (data.length === 0) {
			toast.warning("No data to export");
			return;
		}
		const headers = ["S. NO.", "VEHICLE REG. NO.", "ZONE", "WARD", "TRIPS TO TRANSFER STATION"];
		const rows = data.map((row, idx) => [
			idx + 1,
			`"${row.registration_no.replace(/"/g, '""')}"`,
			`"${row.zone_name.replace(/"/g, '""')}"`,
			`"${row.ward_name.replace(/"/g, '""')}"`,
			row.trip_count,
		]);
		const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.setAttribute("href", url);
		link.setAttribute("download", `gts_trip_report_${selectedDate}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	// Filter wards based on selected zone if selected
	const filteredWards = selectedZone
		? wards.filter((w) => String(w.parent_id) === selectedZone)
		: wards;

	return (
		<div className="flex-1 flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden font-sans">
			{/* Sub-header / Playback Title with Green Line */}
			<div className="bg-white px-6 py-3 border-b border-slate-200 shrink-0 flex items-center justify-between">
				<div>
					<h2 className="text-base font-bold text-slate-700">Trips To GTS (Transfer Station) Report</h2>
					<div className="h-[3px] w-8 bg-emerald-500 mt-1"></div>
				</div>
				<div className="flex gap-2 print:hidden">
					<Button
						onClick={() => window.print()}
						variant="outline"
						className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-slate-300 hover:bg-slate-200"
					>
						PDF
					</Button>
					<Button
						onClick={handleExportCSV}
						variant="outline"
						className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-slate-300 hover:bg-slate-200"
					>
						CSV
					</Button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
				{/* Filter Form Card */}
				<Card className="border border-slate-200 bg-white rounded-xl shadow-sm print:hidden">
					<CardContent className="p-6">
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
							<SearchableDropdown
								label="Zone"
								selectedName={zones.find(z => z.id.toString() === selectedZone)?.region_name || "Select Zone"}
								isSelected={!!selectedZone}
								isOpen={zoneOpen}
								setOpen={setZoneOpen}
								search={zoneSearch}
								setSearch={setZoneSearch}
								items={zones.filter(z => z.region_name.toLowerCase().includes(zoneSearch.toLowerCase()))}
								onSelect={(id) => {
									if (selectedZone === id.toString()) {
										setSelectedZone("");
									} else {
										setSelectedZone(id.toString());
									}
									setSelectedWard("");
									setZoneOpen(false);
								}}
								dropdownRef={zoneRef}
								keyField="id"
								displayField="region_name"
							/>

							<SearchableDropdown
								label="Ward"
								selectedName={filteredWards.find(w => w.id.toString() === selectedWard)?.region_name || "Select Ward"}
								isSelected={!!selectedWard}
								isOpen={wardOpen}
								setOpen={setWardOpen}
								search={wardSearch}
								setSearch={setWardSearch}
								items={filteredWards.filter(w => w.region_name.toLowerCase().includes(wardSearch.toLowerCase()))}
								onSelect={(id) => {
									if (selectedWard === id.toString()) {
										setSelectedWard("");
									} else {
										setSelectedWard(id.toString());
									}
									setWardOpen(false);
								}}
								dropdownRef={wardRef}
								keyField="id"
								displayField="region_name"
							/>

							<SearchableDropdown
								label="Route Type"
								selectedName={routeTypes.find(rt => rt.id.toString() === selectedRouteType)?.name || "Select Route Type"}
								isSelected={!!selectedRouteType}
								isOpen={routeTypeOpen}
								setOpen={setRouteTypeOpen}
								search={routeTypeSearch}
								setSearch={setRouteTypeSearch}
								items={routeTypes.filter(rt => rt.name.toLowerCase().includes(routeTypeSearch.toLowerCase()))}
								onSelect={(id) => {
									if (selectedRouteType === id.toString()) {
										setSelectedRouteType("");
									} else {
										setSelectedRouteType(id.toString());
									}
									setRouteTypeOpen(false);
								}}
								dropdownRef={routeTypeRef}
								keyField="id"
								displayField="name"
							/>

							<SearchableDropdown
								label="Vehicle(s) RTO"
								selectedName={vehicles.find(v => v.id.toString() === selectedVehicle)?.registration_no || "Select Vehicle"}
								isSelected={!!selectedVehicle}
								isOpen={vehicleOpen}
								setOpen={setVehicleOpen}
								search={vehicleSearch}
								setSearch={setVehicleSearch}
								items={vehicles.filter(v => v.registration_no.toLowerCase().includes(vehicleSearch.toLowerCase()))}
								onSelect={(id) => {
									if (selectedVehicle === id.toString()) {
										setSelectedVehicle("");
									} else {
										setSelectedVehicle(id.toString());
									}
									setVehicleOpen(false);
								}}
								dropdownRef={vehicleRef}
								keyField="id"
								displayField="registration_no"
							/>

							{/* Date Filter */}
							<div className="flex flex-col">
								<span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
									Date
								</span>
								<input
									type="date"
									value={selectedDate}
									onChange={(e) => setSelectedDate(e.target.value)}
									className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px]"
								/>
							</div>
						</div>

						<div className="flex justify-start pt-4 border-t border-slate-100">
							<Button
								onClick={loadReport}
								variant="accent"
								loading={loading}
								loadingText="Loading..."
								className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-lg text-xs transition"
							>
								Load
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Results Table Card */}
				<Card className="border border-slate-200 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px] print:border-none print:shadow-none">
					<CardContent className="p-0 flex-1 flex flex-col justify-between overflow-hidden">
						<div className="flex-1 overflow-x-auto">
							<Table
								headers={[
									<div
										key="s"
										className="text-center w-16 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider"
									>
										S. NO.
									</div>,
									<span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
										VEHICLE REG. NO.
									</span>,
									<span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
										ZONE
									</span>,
									<span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
										WARD
									</span>,
									<span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
										VALID TRIPS
									</span>,
									<span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider text-red-600">
										REJECTED TRIPS
									</span>,
									<span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider text-red-600">
										REJECTION REASONS
									</span>,
								]}
								isLoading={loading}
								emptyState="No data to display"
							>
								{data.map((row, idx) => (
									<tr
										key={row.vehicle_id}
										className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors print:border-black"
									>
										<td className="py-3 px-5 text-center text-slate-400 font-mono text-[11px] print:text-black">
											{idx + 1}
										</td>
										<td className="py-3 px-5 font-bold text-slate-800 text-[12px] print:text-black">
											{row.registration_no}
										</td>
										<td className="py-3 px-5 text-slate-600 text-[12px] print:text-black">
											{row.zone_name || "—"}
										</td>
										<td className="py-3 px-5 text-slate-600 text-[12px] print:text-black">
											{row.ward_name || "—"}
										</td>
										<td className="px-6 py-4 text-xs font-semibold text-emerald-700">
											{row.trip_count}
										</td>
										<td className="px-6 py-4 text-xs font-semibold text-red-600">
											{row.rejected_count}
										</td>
										<td className="px-6 py-4 text-[11px] text-slate-500 max-w-[300px]">
											{row.rejection_reasons && row.rejection_reasons.length > 0 ? (
												<ul className="list-disc pl-4 space-y-1">
													{row.rejection_reasons.map((reason, i) => (
														<li key={i}>{reason}</li>
													))}
												</ul>
											) : (
												<span className="text-slate-300">-</span>
											)}
										</td>
									</tr>
								))}
							</Table>
						</div>

						{/* Total Count Footer */}
						<div className="bg-slate-100 border-t border-slate-200 px-5 py-3 text-xs font-bold text-slate-500 select-none uppercase tracking-wider shrink-0">
							{data.length} total vehicles listed
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
