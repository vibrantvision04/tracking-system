"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";
import ReportHeader from "@/components/shared/ReportHeader";
import { Card, CardContent } from "@/components/ui/Card";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";

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

	// Filter states
	const [selectedZone, setSelectedZone] = useState("");
	const [selectedWard, setSelectedWard] = useState("");
	const [selectedRouteType, setSelectedRouteType] = useState("");
	const [selectedVehicle, setSelectedVehicle] = useState("");
	const [selectedDate, setSelectedDate] = useState<string>(() => {
		const today = new Date();
		return today.toISOString().split("T")[0];
	});

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

	useEffect(() => {
		loadReport();
	}, []);

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

	const zoneOptions = zones.map(z => ({ value: String(z.id), label: z.region_name }));
	const wardOptions = filteredWards.map(w => ({ value: String(w.id), label: w.region_name }));
	const routeTypeOptions = routeTypes.map(rt => ({ value: String(rt.id), label: rt.name }));
	const vehicleOptions = vehicles.map(v => ({ value: String(v.id), label: v.registration_no }));

	return (
		<div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans">
			<ReportHeader
				title="Trips To GTS (Transfer Station) Report"
				actions={
					<div className="flex gap-2">
						<Button onClick={() => window.print()} variant="outline" className="px-3 py-1.5 text-xs font-semibold">PDF</Button>
						<Button onClick={handleExportCSV} variant="outline" className="px-3 py-1.5 text-xs font-semibold">CSV</Button>
					</div>
				}
			/>

			<div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
				{/* Filter Form Card */}
				<Card className="print:hidden !overflow-visible">
					<CardContent className="p-6">
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
							<div className="flex flex-col">
								<span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Zone</span>
								<SearchableSelect
									value={selectedZone}
									onChange={(val) => {
										setSelectedZone(val);
										setSelectedWard("");
									}}
									options={zoneOptions}
									placeholder="Select Zone"
								/>
							</div>

							<div className="flex flex-col">
								<span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Ward</span>
								<SearchableSelect
									value={selectedWard}
									onChange={(val) => setSelectedWard(val)}
									options={wardOptions}
									placeholder="Select Ward"
									disabled={!selectedZone}
								/>
							</div>

							<div className="flex flex-col">
								<span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Route Type</span>
								<SearchableSelect
									value={selectedRouteType}
									onChange={(val) => setSelectedRouteType(val)}
									options={routeTypeOptions}
									placeholder="Select Route Type"
								/>
							</div>

							<div className="flex flex-col">
								<span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Vehicle(s) RTO</span>
								<SearchableSelect
									value={selectedVehicle}
									onChange={(val) => setSelectedVehicle(val)}
									options={vehicleOptions}
									placeholder="Select Vehicle"
								/>
							</div>

							<DatePicker
								label="Date"
								value={selectedDate}
								onChange={(e) => setSelectedDate(e.target.value)}
							/>
						</div>

						<div className="flex justify-start pt-4 border-t border-theme-border">
							<Button
								onClick={loadReport}
								variant="success"
								loading={loading}
								loadingText="Loading..."
							>
								Load
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Results Table Card */}
				<Card className="overflow-hidden flex flex-col min-h-[400px] print:border-none print:shadow-none">
					<CardContent className="p-0 flex-1 flex flex-col justify-between overflow-hidden">
						<div className="flex-1 overflow-x-auto">
							<Table
								headers={[
									<div
										key="s"
										className="text-center w-16 text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider"
									>
										S. NO.
									</div>,
									<span className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										VEHICLE REG. NO.
									</span>,
									<span className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										ZONE
									</span>,
									<span className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										WARD
									</span>,
									<span className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
										VALID TRIPS
									</span>,
									<span className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-rose-500">
										REJECTED TRIPS
									</span>,
									<span className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-rose-500">
										REJECTION REASONS
									</span>,
								]}
								isLoading={loading}
								emptyState="No data to display"
							>
								{data.map((row, idx) => (
									<tr
										key={row.vehicle_id}
										className="hover:bg-theme-base/40 border-b border-theme-border/50 transition-colors print:border-black"
									>
										<td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black">
											{idx + 1}
										</td>
										<td className="py-3 px-5 font-bold text-theme-text text-[12px] print:text-black">
											{row.registration_no}
										</td>
										<td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
											{row.zone_name || "—"}
										</td>
										<td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
											{row.ward_name || "—"}
										</td>
										<td className="px-6 py-4 text-xs font-semibold text-emerald-400">
											{row.trip_count}
										</td>
										<td className="px-6 py-4 text-xs font-semibold text-rose-400">
											{row.rejected_count}
										</td>
										<td className="px-6 py-4 text-[11px] text-theme-text-dim max-w-[300px]">
											{row.rejection_reasons && row.rejection_reasons.length > 0 ? (
												<ul className="list-disc pl-4 space-y-1">
													{row.rejection_reasons.map((reason, i) => (
														<li key={i}>{reason}</li>
													))}
												</ul>
											) : (
												<span className="text-theme-text-dim">-</span>
											)}
										</td>
									</tr>
								))}
							</Table>
						</div>

						{/* Total Count Footer */}
						<div className="bg-theme-surface border-t border-theme-border px-5 py-3 text-xs font-bold text-theme-text-dim select-none uppercase tracking-wider shrink-0">
							{data.length} total vehicles listed
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
