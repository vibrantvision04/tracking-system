"use client";

import { useEffect, useState, useCallback } from "react";
import { get, put } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table from "@/components/shared/Table";
import { CheckCircle, XCircle, Eye } from "lucide-react";

interface CleaningTask {
  id: number; assignment_id: number; employee_id: string; employee_name: string;
  route_id: number; route_name: string; ward_id: number; ward_name: string;
  date: string; status: string; coverage_pct: number | null;
  before_image_url: string | null; after_image_url: string | null;
  before_image_captured_at: string | null; after_image_captured_at: string | null;
  approved_by: string | null; approved_at: string | null; rejection_reason: string | null;
}

export default function CleaningTasksPage() {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "", date: "", employee_id: "" });

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.date) params.set("date", filter.date);
      if (filter.employee_id) params.set("employee_id", filter.employee_id);
      const q = params.toString();
      const res = await get<any>(`/api/sweeping/tasks${q ? "?" + q : ""}`);
      const list = res?.data?.data ?? res?.data ?? [];
      setTasks(Array.isArray(list) ? list : []);
    } catch { setTasks([]); } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleApprove = async (id: number) => {
    try { await put(`/api/sweeping/tasks/${id}/review`, { action: "APPROVED" }); toast.success("Task approved"); loadTasks(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleReject = async (id: number) => {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    try { await put(`/api/sweeping/tasks/${id}/review`, { action: "REJECTED", reason }); toast.success("Task rejected"); loadTasks(); }
    catch (e: any) { toast.error(e.message); }
  };

  const badge = (status: string) => {
    const m: Record<string, string> = { PENDING: "bg-yellow-100 text-yellow-800", APPROVED: "bg-green-100 text-green-800", REJECTED: "bg-red-100 text-red-800" };
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${m[status] || "bg-gray-100"}`}>{status}</span>;
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Cleaning Tasks" />
      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="flex gap-4">
          <Select label="Status" value={filter.status} onChange={(e: any) => setFilter({ ...filter, status: e.target.value })}
            options={[
              { label: "All", value: "" },
              { label: "Pending", value: "PENDING" },
              { label: "Approved", value: "APPROVED" },
              { label: "Rejected", value: "REJECTED" },
            ]} />
          <Input label="Date" type="date" value={filter.date} onChange={(e: any) => setFilter({ ...filter, date: e.target.value })} />
          <Input label="Employee ID" value={filter.employee_id} onChange={(e: any) => setFilter({ ...filter, employee_id: e.target.value })} placeholder="Employee ID" />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Table headers={["Employee", "Route", "Ward", "Date", "Coverage", "Status", "Images", "Actions"]} isLoading={loading}>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-2 text-sm">{t.employee_name} ({t.employee_id})</td>
                <td className="p-2 text-sm">{t.route_name}</td>
                <td className="p-2 text-sm">{t.ward_name}</td>
                <td className="p-2 text-sm">{t.date}</td>
                <td className="p-2 text-sm">{t.coverage_pct != null ? `${t.coverage_pct.toFixed(1)}%` : "-"}</td>
                <td className="p-2 text-sm">{badge(t.status)}</td>
                <td className="p-2 text-sm">
                  <div className="flex gap-1">
                    {t.before_image_url ? <a href={t.before_image_url} target="_blank" className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4" /></a> : "-"}
                    {t.after_image_url ? <a href={t.after_image_url} target="_blank" className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4" /></a> : "-"}
                  </div>
                </td>
                <td className="p-2 text-sm">
                  {t.status === "PENDING" ? (
                    <div className="flex gap-1">
                      <button onClick={() => handleApprove(t.id)} className="p-1 hover:bg-green-50 rounded text-green-600"><CheckCircle className="w-4 h-4" /></button>
                      <button onClick={() => handleReject(t.id)} className="p-1 hover:bg-red-50 rounded text-red-500"><XCircle className="w-4 h-4" /></button>
                    </div>
                  ) : <span className="text-xs text-gray-400">{t.approved_by || "-"}</span>}
                </td>
              </tr>
            ))}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
