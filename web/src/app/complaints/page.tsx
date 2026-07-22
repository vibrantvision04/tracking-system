"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table from "@/components/shared/Table";

const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${className}`}>{children}</span>
);

interface Complaint {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_vehicle: string;
  assigned_driver: string;
  created_at: string;
  updated_at: string;
}

const PRIORITIES = ["low", "medium", "high", "critical"];

const STATUSES = ["open", "in_progress", "resolved", "closed"];

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "critical":
      return "bg-red-600 text-white";
    case "high":
      return "bg-orange-500 text-white";
    case "medium":
      return "bg-yellow-500 text-white";
    case "low":
      return "bg-green-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "resolved":
    case "closed":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "in_progress":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "open":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  useEffect(() => {
    loadComplaints();
  }, []);

  const loadComplaints = async () => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; data: Complaint[] }>("/api/complaints");
      setComplaints(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to load complaints.");
    } finally {
      setLoading(false);
    }
  };

  const filteredComplaints = complaints.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !c.title.toLowerCase().includes(q) &&
        !c.description.toLowerCase().includes(q) &&
        !c.assigned_vehicle.toLowerCase().includes(q) &&
        !c.assigned_driver.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterPriority && c.priority !== filterPriority) return false;
    return true;
  });

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const headers = ["ID", "Title", "Priority", "Status", "Assigned Vehicle", "Assigned Driver", "Created At"];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans">
      <PageHeader
        title="Complaint Management"
        description="View citizen complaints related to waste management services"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Complaints" },
        ]}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 pb-8">
        {/* Filters Card */}
      <Card className="overflow-visible">
        <CardHeader className="py-4 border-b border-theme-border">
          <CardTitle className="text-sm uppercase tracking-wider text-theme-text">Filters</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Search title, description, vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
            <Select
              placeholder="Filter by Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[
                { value: "", label: "All Statuses" },
                ...STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") })),
              ]}
            />
            <Select
              placeholder="Filter by Priority"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              options={[
                { value: "", label: "All Priorities" },
                ...PRIORITIES.map((p) => ({ value: p, label: p })),
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Complaints Table */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-4 border-b border-theme-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <CardTitle className="text-sm uppercase tracking-wider text-theme-text">
            Complaints ({filteredComplaints.length})
          </CardTitle>
          <CardDescription className="text-[10px] text-theme-text-dim">
            Showing all registered complaints
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-0">
          <Table headers={headers} isLoading={loading} emptyState="No complaints found." paginate={false}>
            {filteredComplaints.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3.5">
                  <span className="font-mono text-xs font-semibold">#{c.id}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div>
                    <div className="font-medium text-sm">{c.title}</div>
                    <div className="text-xs text-gray-500 line-clamp-1">{c.description}</div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <Badge className={getPriorityColor(c.priority)}>{c.priority}</Badge>
                </td>
                <td className="px-5 py-3.5">
                  <Badge className={getStatusColor(c.status)}>{c.status.replace("_", " ")}</Badge>
                </td>
                <td className="px-5 py-3.5 text-xs">{c.assigned_vehicle || "—"}</td>
                <td className="px-5 py-3.5 text-xs">{c.assigned_driver || "—"}</td>
                <td className="px-5 py-3.5 text-xs text-gray-500">{formatDate(c.created_at)}</td>
              </tr>
            ))}
          </Table>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
