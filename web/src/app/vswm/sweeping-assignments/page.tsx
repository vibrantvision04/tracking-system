"use client";

import { useEffect, useState, useCallback } from "react";
import { get, post, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table from "@/components/shared/Table";
import { Plus, Trash2 } from "lucide-react";

interface Assignment {
  id: number; employee_id: number; employee_name: string; employee_code: string;
  route_id: number; route_name: string; route_code: string;
  ward_id: number; ward_name: string; valid_from: string; valid_to: string | null;
}

export default function SweepingAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [form, setForm] = useState({ employee_id: "", route_id: "", ward_id: "", valid_from: new Date().toISOString().split("T")[0], valid_to: "" });

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try { const res = await get<any>("/api/sweeping/assignments"); setAssignments(res.data || []); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAssignments();
    get<any>("/api/employees?all=true").then((r) => setEmployees(r.data || [])).catch(() => {});
    get<any>("/api/sweeping/routes").then((r) => setRoutes(r.data || [])).catch(() => {});
    get<any>("/api/wards").then((r) => setWards(r?.data || r || [])).catch(() => {});
  }, [loadAssignments]);

  const handleSubmit = async () => {
    if (!form.employee_id || !form.route_id || !form.ward_id) { toast.error("All fields required"); return; }
    try {
      await post("/api/sweeping/assignments", { employee_id: parseInt(form.employee_id), route_id: parseInt(form.route_id), ward_id: parseInt(form.ward_id), valid_from: form.valid_from, valid_to: form.valid_to || undefined });
      toast.success("Assignment created"); setShowForm(false); setForm({ ...form, employee_id: "", route_id: "", ward_id: "" }); loadAssignments();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this assignment?")) return;
    try { await del(`/api/sweeping/assignments/${id}`); toast.success("Assignment removed"); loadAssignments(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Sweeping Route Assignments" actions={!showForm && <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium flex items-center gap-1"><Plus className="w-4 h-4" /> New Assignment</button>} />
      {showForm && (
        <Card>
          <CardHeader><CardTitle>New Assignment</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Select label="Employee" value={form.employee_id} onChange={(e: any) => setForm({ ...form, employee_id: e.target.value })}
              options={employees.map((e: any) => ({ label: `${e.first_name || ""} ${e.last_name || ""} (${e.employee_id})`, value: String(e.id) }))} />
            <Select label="Route" value={form.route_id} onChange={(e: any) => setForm({ ...form, route_id: e.target.value })}
              options={routes.map((r: any) => ({ label: `${r.name} (${r.route_code})`, value: String(r.id) }))} />
            <Select label="Ward" value={form.ward_id} onChange={(e: any) => setForm({ ...form, ward_id: e.target.value })}
              options={wards.map((w: any) => ({ label: w.region_name || `Ward #${w.id}`, value: String(w.id) }))} />
            <Input label="Valid From" type="date" value={form.valid_from} onChange={(e: any) => setForm({ ...form, valid_from: e.target.value })} />
            <Input label="Valid To (optional)" type="date" value={form.valid_to} onChange={(e: any) => setForm({ ...form, valid_to: e.target.value })} />
            <div className="flex gap-2 items-end">
              <button onClick={handleSubmit} className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">Create</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent>
          <Table headers={["Employee", "Code", "Route", "Ward", "Valid From", "Valid To", "Actions"]} isLoading={loading}>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-2 text-sm">{a.employee_name}</td>
                <td className="p-2 text-sm">{a.employee_code}</td>
                <td className="p-2 text-sm">{a.route_name}</td>
                <td className="p-2 text-sm">{a.ward_name}</td>
                <td className="p-2 text-sm">{a.valid_from}</td>
                <td className="p-2 text-sm">{a.valid_to || "Open"}</td>
                <td className="p-2 text-sm"><button onClick={() => handleDelete(a.id)} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
