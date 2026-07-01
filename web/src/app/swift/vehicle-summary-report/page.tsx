"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import ReportHeader from "@/components/shared/ReportHeader";
import Table from "@/components/shared/Table";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";

interface VehicleSummaryRow {
	vehicle_id: number;
	vehicle_reg: string;
	vehicle_type: string;
	zone_name: string;
	ward_name: string;
	total_distance: number;
	transfer_station_trips: number;
	covered_percentage: number;
	inorder_covered_percentage: number;
}

export default function VehicleSummaryReportPage() {
	const [data, setData] = useState<VehicleSummaryRow[]>([]);
	const [loading, setLoading] = useState(false);

	// Filter option states
	const [zones, setZones] = useState<any[]>([]);
	const [wards, setWards] = useState<any[]>([]);
	const [shifts, setShifts] = useState<any[]>([]);
	const [routeTypes, setRouteTypes] = useState<any[]>([]);
	const [routes, setRoutes] = useState<any[]>([]);

	// Selected filters
	const [selectedZone, setSelectedZone] = useState("");
	const [selectedWard, setSelectedWard] = useState("");
	const [selectedShift, setSelectedShift] = useState("");
	const [selectedRouteType, setSelectedRouteType] = useState("");
	const [selectedRoute, setSelectedRoute] = useState("");
	const [selectedDate, setSelectedDate] = useState<string>(() => {
		const today = new Date();
		return today.toISOString().split("T")[0];
	});

	// Load filters options on mount
	useEffect(() => {
		api("/api/zones")
			.then((d: any) => d.success && setZones(d.data || []))
			.catch(console.error);
		api("/api/wards")
			.then((d: any) => d.success && setWards(d.data || []))
			.catch(console.error);
		api("/api/shifts?group=VEHICLE_MOVEMENT")
			.then((d: any) => d.success && setShifts(d.data || []))
			.catch(console.error);
		api("/api/route-types")
			.then((d: any) => d.success && setRouteTypes(d.data || []))
			.catch(console.error);
		api("/api/routes")
			.then((d: any) => d.success && setRoutes(d.data || []))
			.catch(console.error);
	}, []);

	// Filter wards based on selected zone
	const filteredWards = selectedZone
		? wards.filter((w) => String(w.parent_id) === selectedZone)
		: wards;

	// Filter routes based on selected ward, shift, route type
	const filteredRoutes = routes.filter((r) => {
		if (selectedShift && String(r.shift_id) !== selectedShift) return false;
		if (selectedRouteType && String(r.route_type_id) !== selectedRouteType) return false;
		return true;
	});

	const loadReport = async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams();
			if (selectedDate) params.append("date", selectedDate);
			if (selectedZone) params.append("zone_id", selectedZone);
			if (selectedWard) params.append("ward_id", selectedWard);
			if (selectedShift) params.append("shift_id", selectedShift);
			if (selectedRouteType) params.append("route_type_id", selectedRouteType);
			if (selectedRoute) params.append("route_id", selectedRoute);

			const res = await api<{ success: boolean; data: VehicleSummaryRow[] }>(
				`/api/reports/vehicle-summary?${params.toString()}`
			);
			if (res.success && res.data) {
				setData(res.data);
				toast.success("Report data loaded successfully!");
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
		const headers = [
			"S. NO.",
			"VEHICLE RTO",
			"VEHICLE TYPE",
			"ZONE",
			"WARD",
			"TOTAL DISTANCE",
			"TRANSFER STATION TRIPS",
			"COVERED %",
			"INORDER % COVERED"
		];
		const rows = data.map((row, idx) => [
			idx + 1,
			`"${row.vehicle_reg.replace(/"/g, '""')}"`,
			`"${row.vehicle_type.replace(/"/g, '""')}"`,
			`"${row.zone_name.replace(/"/g, '""')}"`,
			`"${row.ward_name.replace(/"/g, '""')}"`,
			row.total_distance.toFixed(2) + " km",
			row.transfer_station_trips,
			row.covered_percentage.toFixed(0) + "%",
			row.inorder_covered_percentage.toFixed(0) + "%"
		]);
		const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.setAttribute("href", url);
		link.setAttribute("download", `vehicle_summary_report_${selectedDate}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	return (
		<div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
			{/* Page Header */}
			<div className="print:hidden">
				<ReportHeader
					title="Vehicle Summary Report"
					actions={
						<div className="flex gap-2">
							<Button onClick={() => window.print()} variant="outline" className="px-3 py-1.5 text-xs font-semibold">PDF</Button>
							<Button onClick={handleExportCSV} variant="outline" className="px-3 py-1.5 text-xs font-semibold">CSV</Button>
						</div>
					}
				/>
			</div>

			{/* Print-only title */}
			<div className="hidden print:block text-left mb-6">
				<h1 className="text-xl font-bold uppercase tracking-tight">Vehicle Summary Report</h1>
				<p className="text-xs text-slate-500 mt-1">Generated Date: {selectedDate}</p>
			</div>

			<div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
			{/* Filters Section */}
			<div className="print:hidden flex flex-col space-y-6">
				<Card className="!overflow-visible">
					<CardContent className="p-6">
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
							<div className="flex flex-col">
								<span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Zone</span>
								<SearchableSelect
									value={selectedZone}
									onChange={(val) => {
										setSelectedZone(val);
										setSelectedWard("");
									}}
									options={[
										{ value: "", label: "Select Zone" },
										...zones.map((z) => ({ value: String(z.id), label: z.region_name }))
									]}
									placeholder="Select Zone"
								/>
							</div>

							<div className="flex flex-col">
								<span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Ward</span>
								<SearchableSelect
									value={selectedWard}
									onChange={setSelectedWard}
									options={[
										{ value: "", label: "Select Ward" },
										...filteredWards.map((w) => ({ value: String(w.id), label: w.region_name }))
									]}
									placeholder="Select Ward"
									disabled={!selectedZone}
								/>
							</div>

							<div className="flex flex-col">
								<span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Shift</span>
								<SearchableSelect
									value={selectedShift}
									onChange={setSelectedShift}
									options={[
										{ value: "", label: "Select Shift" },
										...shifts.map((s) => ({ value: String(s.id), label: s.shift_name }))
									]}
									placeholder="Select Shift"
								/>
							</div>

							<div className="flex flex-col">
								<span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Route Type</span>
								<SearchableSelect
									value={selectedRouteType}
									onChange={setSelectedRouteType}
									options={[
										{ value: "", label: "Search Route Type" },
										...routeTypes.map((rt) => ({ value: String(rt.id), label: rt.name }))
									]}
									placeholder="Search Route Type"
								/>
							</div>

							<div className="flex flex-col">
								<span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Route</span>
								<SearchableSelect
									value={selectedRoute}
									onChange={setSelectedRoute}
									options={[
										{ value: "", label: "Select Route" },
										...filteredRoutes.map((r) => ({ value: String(r.id), label: r.route_name }))
									]}
									placeholder="Select Route"
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
							<DatePicker
								label="Date"
								value={selectedDate}
								onChange={(e) => setSelectedDate(e.target.value)}
							/>
						</div>

						<div className="mt-6 pt-4 border-t border-theme-border/60 flex gap-3">
							<Button
								onClick={loadReport}
								disabled={loading}
								variant="success"
								className="font-semibold px-6 py-2 rounded text-xs"
							>
								Load
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Data Table Section */}
			<div className="flex-1 flex flex-col overflow-hidden min-h-[400px]">
				<Card className="flex-1 overflow-hidden flex flex-col justify-between print:border-none print:shadow-none">
					<CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
						<div className="flex-1 overflow-y-auto custom-scrollbar">
							<Table
								headers={[
									<div key="s" className="text-center w-16 text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										S. No.
									</div>,
									<span key="rto" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										Vehicle RTO
									</span>,
									<span key="type" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										Vehicle Type
									</span>,
									<span key="zone" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										Zone
									</span>,
									<span key="ward" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										Ward
									</span>,
									<span key="dist" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										Total Distance
									</span>,
									<span key="trips" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-center">
										Transfer Station Trips
									</span>,
									<span key="cov" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										Covered %
									</span>,
									<span key="inorder" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										Inorder % Covered
									</span>
								]}
								isLoading={loading}
								emptyState={
									<div className="flex flex-col items-center justify-center gap-1.5 py-12 text-theme-text-dim/60">
										<span className="text-[11px] font-semibold uppercase tracking-wider">No data to display</span>
										<span className="text-[10px]">Select filter options and click "Load" to display vehicle summary logs.</span>
									</div>
								}
							>
								{data.map((row, idx) => (
									<tr key={row.vehicle_id} className="hover:bg-theme-base/40 border-b border-theme-border/50 transition-colors print:border-black">
										<td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black">
											{idx + 1}
										</td>
										<td className="py-3 px-5 font-bold text-theme-text text-[12px] print:text-black font-mono">
											{row.vehicle_reg}
										</td>
										<td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
											{row.vehicle_type}
										</td>
										<td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
											{row.zone_name}
										</td>
										<td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
											{row.ward_name}
										</td>
										<td className="py-3 px-5 text-theme-text font-mono text-[12px] font-semibold print:text-black">
											{row.total_distance.toFixed(2)} km
										</td>
										<td className="py-3 px-5 font-semibold text-emerald-400 text-[12px] print:text-black text-center">
											{row.transfer_station_trips}
										</td>
										<td className="py-3 px-5 text-theme-text font-mono text-[12px] font-semibold print:text-black">
											{row.covered_percentage.toFixed(0)}%
										</td>
										<td className="py-3 px-5 text-theme-text font-mono text-[12px] font-semibold print:text-black">
											{row.inorder_covered_percentage.toFixed(0)}%
										</td>
									</tr>
								))}
							</Table>
						</div>

						{/* Total Count Footer */}
						{data.length > 0 && !loading && (
							<div className="bg-theme-surface border-t border-theme-border px-5 py-3 text-xs font-bold text-theme-text-dim select-none uppercase tracking-wider shrink-0 print:hidden">
								{data.length} total vehicles listed
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
		</div>
	);
}
