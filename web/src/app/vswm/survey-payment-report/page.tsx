"use client";

import React, { useState, useMemo, useEffect } from "react";
import { toast } from "react-toastify";
import {
  Search,
  Download,
  FileText,
  DollarSign,
  Users,
  Clock,
  RefreshCw,
  Printer,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calendar,
  MapPin,
  TrendingUp,
} from "lucide-react";

import PageHeader from "@/components/shared/PageHeader";
import {
  Card,
  CardContent,
} from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";
import Table from "@/components/shared/Table";
import StatCard from "@/components/shared/StatCard";
import { api } from "@/lib/api";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface SurveyPaymentRow {
  id: number;
  date: string;
  supervisorName: string;
  zoneName: string;
  wardName: string;
  totalSurveys: number;
  ratePerSurvey: number;
  totalPayment: number;
  paymentStatus: "Paid" | "Pending" | "Processing";
  remarks: string;
}



const SUPERVISOR_OPTIONS = [
  { value: "", label: "All Supervisors" },
  { value: "Anil Sharma", label: "Anil Sharma" },
  { value: "Vinod Yadav", label: "Vinod Yadav" },
  { value: "Suresh Meena", label: "Suresh Meena" },
  { value: "Ramesh Kumar", label: "Ramesh Kumar" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "Paid", label: "Paid" },
  { value: "Pending", label: "Pending" },
  { value: "Processing", label: "Processing" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// ─── Status Badge Component ─────────────────────────────────────────────────

function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    Paid: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      icon: <CheckCircle size={11} />,
    },
    Pending: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      icon: <AlertCircle size={11} />,
    },
    Processing: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-200",
      icon: <Loader2 size={11} className="animate-spin" />,
    },
  };
  const c = config[status] || config["Pending"];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.bg} ${c.text} ${c.border}`}
    >
      {c.icon}
      {status}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function SurveyPaymentReportPage() {
  const [data, setData] = useState<SurveyPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // ─── Filter option states (from API) ─────────────────────────────────────
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);

  // ─── Selected filters ────────────────────────────────────────────────────
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // ─── Load filter options on mount ────────────────────────────────────────
  useEffect(() => {
    api("/api/zones")
      .then((d: any) => d.success && setZones(d.data || []))
      .catch(console.error);
    api("/api/wards")
      .then((d: any) => d.success && setWards(d.data || []))
      .catch(console.error);
  }, []);

  // Filter wards based on selected zone
  const filteredWards = selectedZone
    ? wards.filter((w) => String(w.parent_id) === selectedZone)
    : wards;

  // ─── Load Report Data ────────────────────────────────────────────────────
  const loadReport = async () => {
    setLoading(true);
    setHasLoaded(true);
    try {
      setData([]);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Computed Stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalSurveys = data.reduce((sum, r) => sum + r.totalSurveys, 0);
    const totalPayment = data.reduce((sum, r) => sum + r.totalPayment, 0);
    const avgRate =
      data.length > 0
        ? Math.round(data.reduce((sum, r) => sum + r.ratePerSurvey, 0) / data.length)
        : 0;
    const pendingCount = data.filter((r) => r.paymentStatus === "Pending").length;
    const paidCount = data.filter((r) => r.paymentStatus === "Paid").length;
    const processingCount = data.filter((r) => r.paymentStatus === "Processing").length;

    return { totalSurveys, totalPayment, avgRate, pendingCount, paidCount, processingCount };
  }, [data]);

  // ─── Summary totals row ──────────────────────────────────────────────────
  const totals = useMemo(() => {
    return {
      surveys: data.reduce((s, r) => s + r.totalSurveys, 0),
      payment: data.reduce((s, r) => s + r.totalPayment, 0),
    };
  }, [data]);

  // ─── Export CSV ──────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = [
      "Sr. No.",
      "Date",
      "Supervisor Name",
      "Zone",
      "Ward",
      "Total Surveys",
      "Rate/Survey (₹)",
      "Total Payment (₹)",
      "Payment Status",
      "Remarks",
    ];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${formatDate(row.date)}"`,
      `"${row.supervisorName}"`,
      `"${row.zoneName}"`,
      `"${row.wardName}"`,
      row.totalSurveys,
      row.ratePerSurvey,
      row.totalPayment,
      `"${row.paymentStatus}"`,
      `"${row.remarks.replace(/"/g, '""')}"`,
    ]);
    // Add totals row
    rows.push([
      "",
      "",
      "",
      "",
      '"TOTAL"',
      totals.surveys,
      "",
      totals.payment,
      "",
      "",
    ]);
    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `survey_payment_report_${fromDate}_to_${toDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Report exported as CSV.");
  };

  // ─── Reset Filters ──────────────────────────────────────────────────────
  const handleResetFilters = () => {
    setSelectedZone("");
    setSelectedWard("");
    setSelectedSupervisor("");
    setSelectedStatus("");
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    setFromDate(weekAgo.toISOString().split("T")[0]);
    setToDate(new Date().toISOString().split("T")[0]);
    setData([]);
    setHasLoaded(false);
    toast.info("Filters have been reset.");
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full p-6 lg:p-8 space-y-6 print:p-0 print:bg-white print:text-black">
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="print:hidden">
        <PageHeader
          title="Survey Payment Report"
          description="Track surveyor payments, review pending settlements, and export payment summaries."
          breadcrumbs={[
            { label: "VSWM", href: "/vswm/shift" },
            { label: "RFID", href: "/vswm/survey-list" },
            { label: "Survey Payment Report" },
          ]}
          actions={
            <div className="flex gap-2">
              <Button
                onClick={() => window.print()}
                variant="outline"
                className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer size={13} />
                PDF
              </Button>
              <Button
                onClick={handleExportCSV}
                variant="outline"
                className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
              >
                <Download size={13} />
                CSV
              </Button>
            </div>
          }
        />
      </div>

      {/* ── Print-only Header ──────────────────────────────────────────────── */}
      <div className="hidden print:block text-left mb-6">
        <h1 className="text-xl font-bold uppercase tracking-tight">
          Survey Payment Report
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Period: {formatDate(fromDate)} — {formatDate(toDate)}
        </p>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      {hasLoaded && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 shrink-0 print:hidden">
          <StatCard
            title="Total Surveys"
            value={stats.totalSurveys.toLocaleString("en-IN")}
            icon={<FileText size={18} className="text-[#10B981]" />}
            description={`Across ${data.length} record(s)`}
          />
          <StatCard
            title="Total Payment"
            value={formatCurrency(stats.totalPayment)}
            icon={<DollarSign size={18} className="text-emerald-500" />}
            description="Cumulative payment amount"
          />
          <StatCard
            title="Avg Rate / Survey"
            value={stats.avgRate > 0 ? `₹${stats.avgRate}` : "—"}
            icon={<TrendingUp size={18} className="text-blue-500" />}
            description="Mean rate per survey entry"
          />
          <StatCard
            title="Pending Payments"
            value={stats.pendingCount}
            icon={<Clock size={18} className="text-amber-500" />}
            description={`${stats.paidCount} paid · ${stats.processingCount} processing`}
          />
        </div>
      )}

      {/* ── Filters Section ────────────────────────────────────────────────── */}
      <div className="print:hidden flex flex-col space-y-6">
        <Card className="!overflow-visible">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Zone */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Zone
                </span>
                <SearchableSelect
                  value={selectedZone}
                  onChange={(val) => {
                    setSelectedZone(val);
                    setSelectedWard("");
                  }}
                  options={[
                    { value: "", label: "All Zones" },
                    ...zones.map((z) => ({
                      value: String(z.id),
                      label: z.region_name,
                    })),
                  ]}
                  placeholder="All Zones"
                />
              </div>

              {/* Ward */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Ward
                </span>
                <SearchableSelect
                  value={selectedWard}
                  onChange={setSelectedWard}
                  options={[
                    { value: "", label: "All Wards" },
                    ...filteredWards.map((w) => ({
                      value: String(w.id),
                      label: w.region_name,
                    })),
                  ]}
                  placeholder="All Wards"
                  disabled={!selectedZone}
                />
              </div>

              {/* Supervisor */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Supervisor
                </span>
                <SearchableSelect
                  value={selectedSupervisor}
                  onChange={setSelectedSupervisor}
                  options={SUPERVISOR_OPTIONS}
                  placeholder="All Supervisors"
                />
              </div>

              {/* Payment Status */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Payment Status
                </span>
                <SearchableSelect
                  value={selectedStatus}
                  onChange={setSelectedStatus}
                  options={PAYMENT_STATUS_OPTIONS}
                  placeholder="All Status"
                />
              </div>

              {/* From Date */}
              <div className="flex flex-col">
                <DatePicker
                  label="From Date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>

              {/* To Date */}
              <div className="flex flex-col">
                <DatePicker
                  label="To Date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 pt-4 border-t border-theme-border/60 flex gap-3">
              <Button
                onClick={loadReport}
                disabled={loading}
                variant="success"
                className="font-semibold px-6 py-2 rounded text-xs"
                loading={loading}
                loadingText="Loading..."
              >
                Load Report
              </Button>
              <Button
                onClick={handleResetFilters}
                variant="outline"
                className="font-semibold px-4 py-2 rounded text-xs flex items-center gap-1.5"
              >
                <RefreshCw size={12} />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Data Table ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-[400px]">
        <Card className="flex-1 overflow-hidden flex flex-col justify-between print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-14 text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
                    Sr. No.
                  </div>,
                  <span key="date" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
                    Date
                  </span>,
                  <span key="sup" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
                    Supervisor
                  </span>,
                  <span key="zone" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
                    Zone
                  </span>,
                  <span key="ward" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
                    Ward
                  </span>,
                  <span key="surveys" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-center">
                    Total Surveys
                  </span>,
                  <span key="rate" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-center">
                    Rate/Survey
                  </span>,
                  <span key="total" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-right">
                    Total Payment
                  </span>,
                  <span key="status" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-center">
                    Status
                  </span>,
                  <span key="remarks" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">
                    Remarks
                  </span>,
                ]}
                isLoading={loading}
                emptyState={
                  <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-theme-text-dim/60">
                    <DollarSign size={28} className="opacity-30" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      {hasLoaded ? "No records found" : "No data to display"}
                    </span>
                    <span className="text-[10px]">
                      {hasLoaded
                        ? "Try adjusting your filters and date range."
                        : 'Select filter options and click "Load Report" to display survey payment data.'}
                    </span>
                  </div>
                }
              >
                {data.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="hover:bg-theme-base/40 border-b border-theme-border/50 transition-colors print:border-black"
                  >
                    {/* Sr. No. */}
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black">
                      {idx + 1}
                    </td>
                    {/* Date */}
                    <td className="py-3 px-5 text-theme-text text-[12px] font-medium print:text-black whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={12} className="text-slate-400 print:hidden" />
                        {formatDate(row.date)}
                      </span>
                    </td>
                    {/* Supervisor */}
                    <td className="py-3 px-5 font-bold text-theme-text text-[12px] print:text-black">
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={12} className="text-indigo-400 print:hidden" />
                        {row.supervisorName}
                      </span>
                    </td>
                    {/* Zone */}
                    <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={12} className="text-emerald-400 print:hidden" />
                        {row.zoneName}
                      </span>
                    </td>
                    {/* Ward */}
                    <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                      {row.wardName}
                    </td>
                    {/* Total Surveys */}
                    <td className="py-3 px-5 text-theme-text font-mono text-[12px] font-semibold text-center print:text-black">
                      {row.totalSurveys}
                    </td>
                    {/* Rate */}
                    <td className="py-3 px-5 text-theme-text-dim font-mono text-[12px] text-center print:text-black">
                      ₹{row.ratePerSurvey}
                    </td>
                    {/* Total Payment */}
                    <td className="py-3 px-5 text-theme-text font-mono text-[12px] font-bold text-right print:text-black">
                      {formatCurrency(row.totalPayment)}
                    </td>
                    {/* Status */}
                    <td className="py-3 px-5 text-center print:text-black">
                      <PaymentStatusBadge status={row.paymentStatus} />
                    </td>
                    {/* Remarks */}
                    <td className="py-3 px-5 text-theme-text-dim text-[11px] max-w-[200px] truncate print:text-black">
                      {row.remarks || "—"}
                    </td>
                  </tr>
                ))}

                {/* ── Summary Totals Row ──────────────────────────────────── */}
                {data.length > 0 && (
                  <tr className="bg-slate-50/80 border-t-2 border-slate-200 font-black print:bg-gray-100">
                    <td className="py-3 px-5" colSpan={5}>
                      <span className="text-[11px] uppercase tracking-widest text-slate-500 font-black">
                        Grand Total
                      </span>
                    </td>
                    <td className="py-3 px-5 text-center font-mono text-[12px] text-slate-800">
                      {totals.surveys}
                    </td>
                    <td className="py-3 px-5" />
                    <td className="py-3 px-5 text-right font-mono text-[12px] text-emerald-700 font-black">
                      {formatCurrency(totals.payment)}
                    </td>
                    <td className="py-3 px-5" colSpan={2} />
                  </tr>
                )}
              </Table>
            </div>

            {/* Total Count Footer */}
            {data.length > 0 && !loading && (
              <div className="bg-theme-surface border-t border-theme-border px-5 py-3 text-xs font-bold text-theme-text-dim select-none uppercase tracking-wider shrink-0 print:hidden flex items-center justify-between">
                <span>{data.length} payment record(s) listed</span>
                <span className="text-[10px] text-theme-text-dim uppercase tracking-widest">
                  VSWM JAIPUR
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
