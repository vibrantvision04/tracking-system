"use client";

import { useEffect, useState } from "react";
import { api, post, del, put } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface Reason {
  id: number;
  name: string;
  description: string;
  snooze: boolean;
  status: boolean;
  reason_text: boolean;
}

export default function ReasonPage() {
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(true);
  const [snooze, setSnooze] = useState(false);
  const [reasonText, setReasonText] = useState(false);

  const [tableFilter, setTableFilter] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Reason[] }>("/api/reasons");
      setReasons(res.data || []);
    } catch {
      toast.error("Failed to load reasons.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const closeForm = () => {
    setFormOpen(false);
    setIsEditing(false);
    setEditingId(null);
    setName("");
    setDescription("");
    setStatus(true);
    setSnooze(false);
    setReasonText(false);
  };

  const handleEdit = (reas: Reason) => {
    setIsEditing(true);
    setEditingId(reas.id);
    setName(reas.name);
    setDescription(reas.description);
    setStatus(reas.status);
    setSnooze(reas.snooze);
    setReasonText(reas.reason_text);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      toast.warning("Name and Description are required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        snooze,
        status,
        reason_text: reasonText
      };

      if (isEditing && editingId) {
        await put(`/api/reasons/${editingId}`, payload);
        toast.success("Reason updated successfully!");
      } else {
        await post("/api/reasons", payload);
        toast.success("Reason created successfully!");
      }
      closeForm();
      loadData();
    } catch {
      toast.error("Failed to save reason configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reas: Reason) => {
    try {
      await del(`/api/reasons/${reas.id}`);
      toast.success("Reason deleted successfully!");
      loadData();
    } catch {
      toast.error("Failed to delete reason.");
    }
  };

  const filteredReasons = reasons.filter(r => {
    const search = tableFilter.toLowerCase();
    return (
      r.name?.toLowerCase().includes(search) ||
      r.description?.toLowerCase().includes(search)
    );
  });

  const Dot = ({ value }: { value: boolean }) => (
    <div className={`w-2.5 h-2.5 rounded-full mx-auto ${value ? "bg-emerald-500 shadow-sm shadow-emerald-500/20" : "bg-red-500 shadow-sm shadow-red-500/20"}`} />
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Reason"
        description="Configure reasons and parameters for solid waste management alerts and exception overrides."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Reason" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Add Reason"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {formOpen && (
          <Card className="animate-fade-in relative z-20">
            <CardHeader>
              <CardTitle>{isEditing ? "Modify Reason" : "Create New Reason"}</CardTitle>
              <CardDescription>Configure snooze rules, status toggles, and descriptions for alert override reasons.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {/* Name field */}
                  <div className="flex flex-col md:col-span-1">
                    <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                      Name <span className="text-red-400">*</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Eg. Overspeeding"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text placeholder:text-theme-text-dim outline-none hover:border-theme-accent/40 focus:border-theme-accent transition"
                      required
                    />
                  </div>

                  {/* Status Toggle Switch */}
                  <div className="flex flex-col items-start justify-center">
                    <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                      Status
                    </span>
                    <button
                      type="button"
                      onClick={() => setStatus(!status)}
                      className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 outline-none ${status ? "bg-amber-500" : "bg-theme-border"}`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${status ? "translate-x-6" : "translate-x-0"}`}
                      />
                    </button>
                  </div>

                  {/* Snooze Radio buttons */}
                  <div className="flex flex-col justify-center">
                    <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                      Snooze
                    </span>
                    <div className="flex items-center gap-6 pl-1 py-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-theme-text">
                        <input
                          type="radio"
                          name="snooze"
                          checked={snooze === true}
                          onChange={() => setSnooze(true)}
                          className="w-4 h-4 accent-amber-500"
                        />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-theme-text">
                        <input
                          type="radio"
                          name="snooze"
                          checked={snooze === false}
                          onChange={() => setSnooze(false)}
                          className="w-4 h-4 accent-amber-500"
                        />
                        <span>No</span>
                      </label>
                    </div>
                  </div>

                  {/* Reason Text Radio buttons */}
                  <div className="flex flex-col justify-center">
                    <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                      Reason Text
                    </span>
                    <div className="flex items-center gap-6 pl-1 py-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-theme-text">
                        <input
                          type="radio"
                          name="reason_text"
                          checked={reasonText === true}
                          onChange={() => setReasonText(true)}
                          className="w-4 h-4 accent-amber-500"
                        />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-theme-text">
                        <input
                          type="radio"
                          name="reason_text"
                          checked={reasonText === false}
                          onChange={() => setReasonText(false)}
                          className="w-4 h-4 accent-amber-500"
                        />
                        <span>No</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Description textarea */}
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                    Description <span className="text-red-400">*</span>
                  </span>
                  <textarea
                    rows={4}
                    placeholder="Enter description here..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text placeholder:text-theme-text-dim outline-none hover:border-theme-accent/40 focus:border-theme-accent transition resize-none"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-theme-border justify-end">
                  <Button type="button" onClick={closeForm} variant="outline">
                    Cancel
                  </Button>
                  <Button type="submit" variant="accent" loading={submitting} loadingText="Saving...">
                    Submit
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Reason Configuration Settings</CardTitle>
              <CardDescription>Full list of exception override reasons and tracking behaviors.</CardDescription>
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
                {reasons.length} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. NO.</div>,
                  "REASON",
                  "DESCRIPTION",
                  <div key="sn" className="text-center w-24">SNOOZE</div>,
                  <div key="st" className="text-center w-24">STATUS</div>,
                  <div key="rt" className="text-center w-32">REASON TEXT</div>,
                  <div key="a" className="text-right pr-4 w-32">ACTION</div>
                ]}
                isLoading={loading}
                emptyState="No data to display"
              >
                {filteredReasons.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3.5 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-theme-text text-[13px]">
                      {r.name}
                    </td>
                    <td className="py-3.5 px-5 text-theme-text-dim text-[13px] max-w-xs truncate" title={r.description}>
                      {r.description}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <Dot value={r.snooze} />
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <Dot value={r.status} />
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <Dot value={r.reason_text} />
                    </td>
                    <td className="py-3.5 px-5 text-right flex items-center justify-end gap-2.5 h-[53px] pr-6">
                      <EditButton onClick={() => handleEdit(r)} />
                      <DeleteButton
                        onDelete={() => handleDelete(r)}
                        confirmMessage={`Delete reason "${r.name}"?`}
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
