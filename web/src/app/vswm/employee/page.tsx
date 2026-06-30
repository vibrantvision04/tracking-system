"use client";
import { useEffect, useState, useRef } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";
import { z } from "zod";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface Employee {
  id: number; first_name: string; middle_name: string; last_name: string;
  employee_id: string; email: string; aadhaar_no: string; contact_no: string;
  alt_contact_no: string; address: string; other_details: string;
  document_file_type: string; document_file_path: string; is_active: boolean; created_at: string;
}

const employeeSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(50, "Max 50 characters"),
  middle_name: z.string().trim().max(50, "Max 50 characters").optional(),
  last_name: z.string().trim().min(1, "Last name is required").max(50, "Max 50 characters"),
  employee_id: z.string().trim().min(1, "IMC Employee ID is required").max(50, "Max 50 characters"),
  email: z.union([z.string().trim().email("Invalid email format"), z.literal("")]),
  aadhaar_no: z.string().trim().regex(/^\d{12}$/, "Aadhaar must be 12 digits"),
  contact_no: z.string().trim().regex(/^\d{10}$/, "Contact number must be 10 digits"),
  alt_contact_no: z.union([z.string().trim().regex(/^\d{10}$/, "Alt contact must be 10 digits"), z.literal("")]),
  address: z.string().trim().min(1, "Address is required").max(500, "Max 500 characters"),
  other_details: z.string().trim().max(500, "Max 500 characters").optional(),
  document_file_type: z.enum(["Aadhaar", "PAN", "Voter ID", "Driving License"]),
  document_file_path: z.string().trim().optional()
});

export default function EmployeePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mockFileName, setMockFileName] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [userAccountError, setUserAccountError] = useState("");

  const [formData, setFormData] = useState({
    id: null as number | null, first_name: "", middle_name: "", last_name: "", employee_id: "",
    email: "", aadhaar_no: "", contact_no: "", alt_contact_no: "", address: "", other_details: "",
    document_file_type: "Aadhaar", document_file_path: "",
    login_password: "", login_role: "USER"
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await api<{ success: boolean; data: Employee[] }>("/api/employees");
      if (res.success) setEmployees(res.data || []);
    } catch { toast.error("Failed to load employees"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleOpenForm = async (emp?: Employee) => {
    setFormErrors({});
    if (emp) {
      let existingRole = "USER";
      try {
        const userRes = await api<{ success: boolean; data: { id: number; email: string; role: string }[] }>("/api/users?all=true");
        if (userRes.success) {
          const userEmail = `${emp.employee_id}@vswm.com`;
          const match = userRes.data.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
          if (match) existingRole = match.role;
        }
      } catch { /* ignore */ }
      setFormData({
        id: emp.id, first_name: emp.first_name, middle_name: emp.middle_name, last_name: emp.last_name,
        employee_id: emp.employee_id, email: emp.email, aadhaar_no: emp.aadhaar_no, contact_no: emp.contact_no,
        alt_contact_no: emp.alt_contact_no, address: emp.address, other_details: emp.other_details,
        document_file_type: emp.document_file_type || "Aadhaar", document_file_path: emp.document_file_path,
        login_password: "", login_role: existingRole
      });
      setMockFileName(emp.document_file_path ? emp.document_file_path.split("/").pop() || "" : "");
      setIsEditing(true);
    } else {
      setFormData({
        id: null, first_name: "", middle_name: "", last_name: "", employee_id: "", email: "",
        aadhaar_no: "", contact_no: "", alt_contact_no: "", address: "", other_details: "",
        document_file_type: "Aadhaar", document_file_path: "", login_password: "", login_role: "USER"
      });
      setMockFileName(""); setIsEditing(false);
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => { setIsFormOpen(false); setMockFileName(""); setIsEditing(false); setFormErrors({}); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setMockFileName(file.name); setFormData(prev => ({ ...prev, document_file_path: `uploads/${file.name}` })); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = employeeSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach(err => { if (err.path[0]) errors[err.path[0].toString()] = err.message; });
      setFormErrors(errors); toast.warn(result.error.issues[0].message); return;
    }
    setFormErrors({}); setSubmitting(true);
    try {
      const p = result.data;
      const payload = { ...p, middle_name: p.middle_name || "", alt_contact_no: p.alt_contact_no || "", other_details: p.other_details || "", document_file_path: p.document_file_path || "" };
      if (isEditing && formData.id) {
        const res = await put<{ success: boolean }>(`/api/employees/${formData.id}`, payload);
        if (res.success) {
          if (formData.login_password) {
            // Login email always derived from employee_id, never from personal email field
            const userEmail = `${formData.employee_id}@vswm.com`;
            try {
              await post("/api/users", {
                email: userEmail.toLowerCase(),
                password: formData.login_password,
                role: formData.login_role,
              });
              toast.success("Employee updated & user account created!");
            } catch {
              toast.warn("Employee updated but user account failed — check RBAC");
            }
          } else {
            toast.success("Employee updated successfully!");
          }
          fetchEmployees(); handleCloseForm();
        } else toast.error("Failed to update");
      } else {
        const res = await post<{ success: boolean }>(`/api/employees`, payload);
        if (res.success) {
          if (formData.login_password) {
            const userEmail = `${formData.employee_id}@vswm.com`;
            try {
              await post("/api/users", {
                email: userEmail.toLowerCase(),
                password: formData.login_password,
                role: formData.login_role,
              });
              toast.success("Employee & user account created!");
            } catch {
              toast.warn("Employee created but user account failed — go to RBAC to set up login");
            }
          } else {
            toast.success("Employee created successfully!");
          }
          fetchEmployees(); handleCloseForm();
        } else toast.error("Failed to create");
      }
    } catch { toast.error("An error occurred"); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number, name: string) => {
    try {
      const res = await del<{ success: boolean }>(`/api/employees/${id}`);
      if (res.success) { toast.success("Employee deleted successfully!"); fetchEmployees(); } else toast.error("Failed to delete");
    } catch { toast.error("An error occurred during deletion"); }
  };

  const formatFullName = (emp: Employee) => [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
  
  const filteredEmployees = employees.filter(emp => {
    const fn = `${emp.first_name} ${emp.middle_name} ${emp.last_name}`.toLowerCase();
    const q = searchQuery.toLowerCase();
    return fn.includes(q) || emp.employee_id.includes(q) || emp.aadhaar_no.includes(q) || emp.contact_no.includes(q);
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Employee Management"
        description="Manage employee profiles, contact details, and documents."
        breadcrumbs={[{ label: "VSWM", href: "/vswm/shift" }, { label: "Employees" }]}
        actions={
          <Button onClick={isFormOpen ? handleCloseForm : () => handleOpenForm()} variant={isFormOpen ? "secondary" : "primary"}>
            {isFormOpen ? "✕ Close" : "+ Add Employee"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {isFormOpen && (
          <Card className="animate-fade-in relative z-20">
            <CardHeader>
              <CardTitle>{isEditing ? "✏️ Edit Employee Profile" : "👥 Add New Employee"}</CardTitle>
              <CardDescription>Fill in employee details and upload identification documents.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <Input label="First Name" placeholder="Eg. Rajesh" required value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} />
                    {formErrors.first_name && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.first_name}</span>}
                  </div>
                  <div>
                    <Input label="Middle Name" placeholder="Eg. Kumar" value={formData.middle_name} onChange={e => setFormData({ ...formData, middle_name: e.target.value })} />
                    {formErrors.middle_name && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.middle_name}</span>}
                  </div>
                  <div>
                    <Input label="Last Name" placeholder="Eg. Patidar" required value={formData.last_name} onChange={e => setFormData({ ...formData, last_name: e.target.value })} />
                    {formErrors.last_name && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.last_name}</span>}
                  </div>

                  <div>
                    <Input label="Employee Id" placeholder="Eg. 458ACD98U6" required value={formData.employee_id} onChange={e => setFormData({ ...formData, employee_id: e.target.value })} />
                    {formErrors.employee_id && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.employee_id}</span>}
                  </div>
                  <div>
                    <Input type="email" label="Email" placeholder="xyz@abc.def" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    {formErrors.email && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.email}</span>}
                  </div>
                  <div>
                    <Input label="Aadhaar No." placeholder="12 digits" required value={formData.aadhaar_no} onChange={e => setFormData({ ...formData, aadhaar_no: e.target.value })} />
                    {formErrors.aadhaar_no && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.aadhaar_no}</span>}
                  </div>

                  <div>
                    <Input label="Contact Number" placeholder="10 digits" required value={formData.contact_no} onChange={e => setFormData({ ...formData, contact_no: e.target.value })} />
                    {formErrors.contact_no && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.contact_no}</span>}
                  </div>
                  <div>
                    <Input label="Alternate Contact" placeholder="10 digits" value={formData.alt_contact_no} onChange={e => setFormData({ ...formData, alt_contact_no: e.target.value })} />
                    {formErrors.alt_contact_no && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.alt_contact_no}</span>}
                  </div>
                  <div />

                  <div>
                    <Input type="password" label="Login Password (leave blank to skip user creation)" placeholder="Min 12 chars" value={formData.login_password} onChange={e => setFormData({ ...formData, login_password: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-2 block">Login Role</label>
                    <select value={formData.login_role} onChange={e => setFormData({ ...formData, login_role: e.target.value })} className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition">
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="DRIVER">DRIVER</option>
                      <option value="SUPERVISOR">SUPERVISOR</option>
                      <option value="ZONE_MANAGER">ZONE MANAGER</option>
                      <option value="OPEN_DEPOT">OPEN DEPOT</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-2 block">Address <span className="text-rose-500">*</span></label>
                    <textarea value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} rows={3} className="w-full px-4 py-2 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition" required />
                    {formErrors.address && <span className="text-[10px] text-rose-500 mt-1 block">{formErrors.address}</span>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-2 block">Other Details</label>
                    <textarea value={formData.other_details} onChange={e => setFormData({ ...formData, other_details: e.target.value })} rows={3} className="w-full px-4 py-2 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition" />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-2 block">Document Type <span className="text-rose-500">*</span></label>
                    <select value={formData.document_file_type} onChange={e => setFormData({ ...formData, document_file_type: e.target.value })} className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition">
                      {["Aadhaar", "PAN", "Voter ID", "Driving License"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-2 block">Upload Document <span className="text-rose-500">*</span></label>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.jpg,.jpeg,.png" />
                    <div onClick={() => fileInputRef.current?.click()} className="w-full px-4 py-3 bg-theme-surface border-2 border-dashed border-theme-border hover:border-emerald-500/50 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition">
                      <span className="text-xs font-bold text-emerald-400">{mockFileName ? `Selected: ${mockFileName}` : "Click to upload document"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-theme-border">
                  <Button type="submit" variant="accent" loading={submitting}>Submit</Button>
                  <Button type="button" variant="outline" onClick={handleCloseForm}>Close</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Employee Directory</CardTitle><CardDescription>All registered employees.</CardDescription></div>
            <Input placeholder="Filter..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-64" />
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={[<div key="s" className="w-16">S.No.</div>, "ID", "Name", "Aadhaar", "Email", "Contact", "Address", <div key="a" className="text-right w-24">Action</div>]}
              isLoading={loading}
              emptyState={searchQuery ? "No matching employees found" : "No employees registered"}
            >
              {filteredEmployees.map((emp, idx) => (
                <tr key={emp.id} className="hover:bg-theme-base/40 transition-colors group text-theme-text-dim text-xs">
                  <td className="py-3 px-5 font-mono text-[11px]">{idx + 1}</td>
                  <td className="py-3 px-5 font-semibold text-theme-text">{emp.employee_id}</td>
                  <td className="py-3 px-5 font-medium text-theme-text">{formatFullName(emp)}</td>
                  <td className="py-3 px-5 font-mono">{emp.aadhaar_no}</td>
                  <td className="py-3 px-5">{emp.email || "-"}</td>
                  <td className="py-3 px-5 font-mono">{emp.contact_no}</td>
                  <td className="py-3 px-5 max-w-[150px] truncate" title={emp.address}>{emp.address}</td>
                  <td className="py-3 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditButton onClick={() => handleOpenForm(emp)} />
                      <DeleteButton onDelete={() => handleDelete(emp.id, formatFullName(emp))} confirmMessage={`Delete ${formatFullName(emp)}?`} />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{filteredEmployees.length} total</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest font-mono">VSWM EMPLOYEES</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
