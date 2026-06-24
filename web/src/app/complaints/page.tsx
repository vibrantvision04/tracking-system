"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${className}`}>{children}</span>
);

interface Complaint {
  id: number;
  complaintNo: string;
  complainantName: string;
  phone: string;
  ward: string;
  zone: string;
  type: string;
  priority: string;
  status: string;
  description: string;
  createdAt: string;
  resolvedAt?: string;
}

const DUMMY_COMPLAINTS: Complaint[] = [
  {
    id: 1,
    complaintNo: "CMP-2024-001",
    complainantName: "Rajesh Kumar",
    phone: "9876543210",
    ward: "Ward 28",
    zone: "Zone 1 - Hawa Mahal-Aamer",
    type: "Missed Collection",
    priority: "High",
    status: "Pending",
    description: "Waste not collected from household for 3 days",
    createdAt: "2024-06-20T10:30:00",
  },
  {
    id: 2,
    complaintNo: "CMP-2024-002",
    complainantName: "Sunita Sharma",
    phone: "9876543211",
    ward: "Ward 35",
    zone: "Zone 2 - Civil Lines",
    type: "Overflowing Bin",
    priority: "Medium",
    status: "In Progress",
    description: "Community bin overflowing, needs immediate attention",
    createdAt: "2024-06-21T14:15:00",
  },
  {
    id: 3,
    complaintNo: "CMP-2024-003",
    complainantName: "Mohammed Ali",
    phone: "9876543212",
    ward: "Ward 42",
    zone: "Zone 3 - Sodala",
    type: "Vehicle Breakdown",
    priority: "High",
    status: "Resolved",
    description: "Vehicle broke down mid-route, waste not collected",
    createdAt: "2024-06-19T09:00:00",
    resolvedAt: "2024-06-19T16:30:00",
  },
  {
    id: 4,
    complaintNo: "CMP-2024-004",
    complainantName: "Priya Singh",
    phone: "9876543213",
    ward: "Ward 18",
    zone: "Zone 1 - Hawa Mahal-Aamer",
    type: "Late Collection",
    priority: "Low",
    status: "Pending",
    description: "Vehicle arrived 2 hours late for collection",
    createdAt: "2024-06-22T08:45:00",
  },
  {
    id: 5,
    complaintNo: "CMP-2024-005",
    complainantName: "Vijay Verma",
    phone: "9876543214",
    ward: "Ward 56",
    zone: "Zone 4 - Mansarovar",
    type: "Rude Behavior",
    priority: "Medium",
    status: "In Progress",
    description: "Driver behaved rudely with residents",
    createdAt: "2024-06-21T11:20:00",
  },
];

const COMPLAINT_TYPES = [
  "Missed Collection",
  "Overflowing Bin",
  "Vehicle Breakdown",
  "Late Collection",
  "Rude Behavior",
  "Improper Disposal",
  "Other",
];

const PRIORITIES = ["Low", "Medium", "High", "Critical"];

const STATUSES = ["Pending", "In Progress", "Resolved", "Rejected"];

const ZONES = [
  "Zone 1 - Hawa Mahal-Aamer",
  "Zone 2 - Civil Lines",
  "Zone 3 - Sodala",
  "Zone 4 - Mansarovar",
  "Zone 5 - Vaishali Nagar",
];

const WARDS = [
  "Ward 18",
  "Ward 28",
  "Ward 35",
  "Ward 42",
  "Ward 56",
  "Ward 63",
  "Ward 71",
];

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "Critical":
      return "bg-red-600 text-white";
    case "High":
      return "bg-orange-500 text-white";
    case "Medium":
      return "bg-yellow-500 text-white";
    case "Low":
      return "bg-green-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "Resolved":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "In Progress":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "Pending":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Rejected":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>(DUMMY_COMPLAINTS);
  const [filteredComplaints, setFilteredComplaints] = useState<Complaint[]>(DUMMY_COMPLAINTS);

  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState<Complaint | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterZone, setFilterZone] = useState("");

  // Form fields
  const [complainantName, setComplainantName] = useState("");
  const [phone, setPhone] = useState("");
  const [ward, setWard] = useState("");
  const [zone, setZone] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    let filtered = complaints;

    if (searchQuery) {
      filtered = filtered.filter(
        (c) =>
          c.complainantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.complaintNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.includes(searchQuery)
      );
    }

    if (filterStatus) {
      filtered = filtered.filter((c) => c.status === filterStatus);
    }

    if (filterPriority) {
      filtered = filtered.filter((c) => c.priority === filterPriority);
    }

    if (filterZone) {
      filtered = filtered.filter((c) => c.zone === filterZone);
    }

    setFilteredComplaints(filtered);
  }, [searchQuery, filterStatus, filterPriority, filterZone, complaints]);

  const openAdd = () => {
    setEditingComplaint(null);
    setComplainantName("");
    setPhone("");
    setWard("");
    setZone("");
    setType("");
    setPriority("Medium");
    setStatus("Pending");
    setDescription("");
    setFormOpen(true);
  };

  const openEdit = (c: Complaint) => {
    setEditingComplaint(c);
    setComplainantName(c.complainantName);
    setPhone(c.phone);
    setWard(c.ward);
    setZone(c.zone);
    setType(c.type);
    setPriority(c.priority);
    setStatus(c.status);
    setDescription(c.description);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (editingComplaint) {
      // Update existing
      setComplaints(
        complaints.map((c) =>
          c.id === editingComplaint.id
            ? {
                ...c,
                complainantName,
                phone,
                ward,
                zone,
                type,
                priority,
                status,
                description,
                resolvedAt: status === "Resolved" ? new Date().toISOString() : c.resolvedAt,
              }
            : c
        )
      );
      toast.success("Complaint updated successfully");
    } else {
      // Add new
      const newComplaint: Complaint = {
        id: Math.max(...complaints.map((c) => c.id)) + 1,
        complaintNo: `CMP-2024-${String(complaints.length + 1).padStart(3, "0")}`,
        complainantName,
        phone,
        ward,
        zone,
        type,
        priority,
        status,
        description,
        createdAt: new Date().toISOString(),
      };
      setComplaints([...complaints, newComplaint]);
      toast.success("Complaint registered successfully");
    }

    setFormOpen(false);
    setSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    setComplaints(complaints.filter((c) => c.id !== id));
    toast.success("Complaint deleted successfully");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const headers = [
    "Complaint No",
    "Complainant",
    "Phone",
    "Ward",
    "Type",
    "Priority",
    "Status",
    "Created At",
    "Actions",
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      <PageHeader
        title="Complaint Management"
        description="Register and track citizen complaints related to waste management services"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Complaints" },
        ]}
        actions={
          <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Register Complaint
          </Button>
        }
      />

      {/* Filters Card */}
      <Card className="overflow-visible">
        <CardHeader className="py-4 border-b border-theme-border">
          <CardTitle className="text-sm uppercase tracking-wider text-theme-text">Filters</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              placeholder="Search by name, phone, or complaint no..."
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
                ...STATUSES.map((s) => ({ value: s, label: s })),
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
            <Select
              placeholder="Filter by Zone"
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value)}
              options={[
                { value: "", label: "All Zones" },
                ...ZONES.map((z) => ({ value: z, label: z })),
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
          <Table headers={headers} paginate={false}>
            {filteredComplaints.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3.5">
                  <span className="font-mono text-xs font-semibold">{c.complaintNo}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div>
                    <div className="font-medium text-sm">{c.complainantName}</div>
                    <div className="text-xs text-gray-500">{c.phone}</div>
                  </div>
                </td>
                <td className="px-5 py-3.5">{c.phone}</td>
                <td className="px-5 py-3.5">{c.ward}</td>
                <td className="px-5 py-3.5">{c.type}</td>
                <td className="px-5 py-3.5">
                  <Badge className={getPriorityColor(c.priority)}>{c.priority}</Badge>
                </td>
                <td className="px-5 py-3.5">
                  <Badge className={getStatusColor(c.status)}>{c.status}</Badge>
                </td>
                <td className="px-5 py-3.5">{formatDate(c.createdAt)}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <EditButton onClick={() => openEdit(c)} />
                    <DeleteButton onDelete={() => handleDelete(c.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Form Modal */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
            <CardHeader>
              <CardTitle className="text-lg">
                {editingComplaint ? "Edit Complaint" : "Register New Complaint"}
              </CardTitle>
              <CardDescription>
                {editingComplaint ? "Update complaint details" : "Fill in the complaint details below"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-theme-text mb-1">Complainant Name *</label>
                    <Input
                      value={complainantName}
                      onChange={(e) => setComplainantName(e.target.value)}
                      required
                      placeholder="Enter full name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-theme-text mb-1">Phone Number *</label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      placeholder="10-digit number"
                      pattern="[0-9]{10}"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-theme-text mb-1">Zone *</label>
                    <Select
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      options={ZONES.map((z) => ({ value: z, label: z }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-theme-text mb-1">Ward *</label>
                    <Select
                      value={ward}
                      onChange={(e) => setWard(e.target.value)}
                      options={WARDS.map((w) => ({ value: w, label: w }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-theme-text mb-1">Complaint Type *</label>
                    <Select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      options={COMPLAINT_TYPES.map((t) => ({ value: t, label: t }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-theme-text mb-1">Priority *</label>
                    <Select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-theme-text mb-1">Status *</label>
                    <Select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      options={STATUSES.map((s) => ({ value: s, label: s }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-theme-text mb-1">Description *</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    rows={4}
                    className="w-full px-3 py-2 border border-theme-border rounded-lg text-sm focus:outline-none focus:border-emerald-500 bg-theme-surface text-theme-text resize-none"
                    placeholder="Describe the complaint in detail..."
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-theme-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFormOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {submitting ? "Saving..." : editingComplaint ? "Update Complaint" : "Register Complaint"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
