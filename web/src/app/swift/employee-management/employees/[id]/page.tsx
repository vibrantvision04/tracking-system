"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

interface Role {
  id: number;
  name: string;
  scope_type: string;
}

interface Department {
  id: number;
  name: string;
}

interface Designation {
  id: number;
  name: string;
}

interface Region {
  id: number;
  name: string;
}

interface FieldErrors {
  [key: string]: string;
}

interface FormData {
  first_name: string;
  middle_name: string;
  last_name: string;
  employee_id: string;
  email: string;
  aadhaar_no: string;
  contact_no: string;
  alt_contact_no: string;
  address: string;
  other_details: string;
  password: string;
  role_id: number | "";
  department_id: number | "";
  designation_id: number | "";
  zone_id: number | "";
  ward_ids: number[];
  is_active: boolean;
}

const initialFormData: FormData = {
  first_name: "",
  middle_name: "",
  last_name: "",
  employee_id: "",
  email: "",
  aadhaar_no: "",
  contact_no: "",
  alt_contact_no: "",
  address: "",
  other_details: "",
  password: "",
  role_id: "",
  department_id: "",
  designation_id: "",
  zone_id: "",
  ward_ids: [],
  is_active: true,
};

export default function EmployeeFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === "new";

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  // Dropdown data
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [wards, setWards] = useState<Region[]>([]);

  // Derive scope_type from selected role
  const selectedRole = roles.find((r) => r.id === formData.role_id);
  const scopeType = selectedRole?.scope_type || "none";

  // Fetch dropdown data on mount
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [rolesRes, deptsRes, desigsRes, zonesRes, wardsRes] = await Promise.all([
          api<{ success: boolean; data: Role[] }>("/api/rbac/roles", { skipToast: true }),
          api<{ success: boolean; data: Department[] }>("/api/departments", { skipToast: true }),
          api<{ success: boolean; data: Designation[] }>("/api/designations", { skipToast: true }),
          api<{ success: boolean; data: Region[] }>("/api/regions?type=zone", { skipToast: true }),
          api<{ success: boolean; data: Region[] }>("/api/regions?type=ward", { skipToast: true }),
        ]);
        if (rolesRes.success) setRoles(rolesRes.data || []);
        if (deptsRes.success) setDepartments(deptsRes.data || []);
        if (desigsRes.success) setDesignations(desigsRes.data || []);
        if (zonesRes.success) setZones(zonesRes.data || []);
        if (wardsRes.success) setWards(wardsRes.data || []);
      } catch {
        toast.error("Failed to load form data");
      }
    };
    fetchDropdowns();
  }, []);

  // Fetch existing employee for edit mode
  useEffect(() => {
    if (isNew) return;
    const fetchEmployee = async () => {
      try {
        const res = await api<{ success: boolean; data: any }>(`/api/employee-management/employees/${id}`, { skipToast: true });
        if (res.success && res.data) {
          const emp = res.data;
          setFormData({
            first_name: emp.first_name || "",
            middle_name: emp.middle_name || "",
            last_name: emp.last_name || "",
            employee_id: emp.employee_id || "",
            email: emp.email || "",
            aadhaar_no: emp.aadhaar_no || "",
            contact_no: emp.contact_no || "",
            alt_contact_no: emp.alt_contact_no || "",
            address: emp.address || "",
            other_details: emp.other_details || "",
            password: "",
            role_id: emp.role_id || "",
            department_id: emp.department_id || "",
            designation_id: emp.designation_id || "",
            zone_id: emp.scopes?.find((s: any) => s.scope_type === "zone")?.region_id || "",
            ward_ids: emp.scopes?.filter((s: any) => s.scope_type === "ward").map((s: any) => s.region_id) || [],
            is_active: emp.is_active !== false,
          });
        }
      } catch {
        toast.error("Failed to load employee data");
        router.push("/swift/employee-management/employees");
      } finally {
        setLoading(false);
      }
    };
    fetchEmployee();
  }, [id, isNew, router]);

  // Clear scope fields when role changes
  const handleRoleChange = (roleId: number | "") => {
    const newRole = roles.find((r) => r.id === roleId);
    const newScopeType = newRole?.scope_type || "none";

    setFormData((prev) => ({
      ...prev,
      role_id: roleId,
      // Clear stale scope values when scope_type changes
      zone_id: newScopeType === "zone" ? prev.zone_id : "",
      ward_ids: newScopeType === "ward" ? prev.ward_ids : [],
    }));
  };

  // Ward multi-select toggle
  const handleWardToggle = (wardId: number) => {
    setFormData((prev) => ({
      ...prev,
      ward_ids: prev.ward_ids.includes(wardId)
        ? prev.ward_ids.filter((id) => id !== wardId)
        : [...prev.ward_ids, wardId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSubmitting(true);

    const payload: any = {
      first_name: formData.first_name.trim(),
      middle_name: formData.middle_name.trim(),
      last_name: formData.last_name.trim(),
      employee_id: formData.employee_id.trim(),
      email: formData.email.trim(),
      aadhaar_no: formData.aadhaar_no.trim(),
      contact_no: formData.contact_no.trim(),
      alt_contact_no: formData.alt_contact_no.trim(),
      address: formData.address.trim(),
      other_details: formData.other_details.trim(),
      password: formData.password,
      role_id: formData.role_id ? Number(formData.role_id) : 0,
      department_id: formData.department_id ? Number(formData.department_id) : 0,
      designation_id: formData.designation_id ? Number(formData.designation_id) : 0,
      is_active: formData.is_active,
    };

    // Include scope fields based on role's scope_type
    if (scopeType === "zone" && formData.zone_id) {
      payload.zone_id = Number(formData.zone_id);
    }
    if (scopeType === "ward" && formData.ward_ids.length > 0) {
      payload.ward_ids = formData.ward_ids;
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const token = typeof window !== "undefined" ? localStorage.getItem("swift_access_token") : null;
      const url = isNew ? `${API_URL}/api/employee-management/employees` : `${API_URL}/api/employee-management/employees/${id}`;
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json();

      if (!res.ok) {
        if (body.field_errors) {
          setFieldErrors(body.field_errors);
        }
        toast.error(body.error || "Submission failed");
        return;
      }

      toast.success(isNew ? "Employee created successfully!" : "Employee updated successfully!");
      router.push("/swift/employee-management/employees");
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-theme-base">
        <div className="text-theme-text-dim text-sm animate-pulse">Loading employee...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title={isNew ? "Create Employee" : "Edit Employee"}
        description={isNew ? "Create a new employee with all related information in one place." : "Update employee details, role, and scope assignments."}
        breadcrumbs={[
          { label: "Employee Management", href: "/swift/employee-management/employees" },
          { label: isNew ? "Create Employee" : "Edit Employee" },
        ]}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Section 1: Identity */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Identity Information</CardTitle>
                <CardDescription>Employee personal and contact details.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Input
                  label="First Name"
                  placeholder="Eg. Rajesh"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  error={fieldErrors.first_name}
                />
                <Input
                  label="Middle Name"
                  placeholder="Eg. Kumar"
                  value={formData.middle_name}
                  onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                  error={fieldErrors.middle_name}
                />
                <Input
                  label="Last Name"
                  placeholder="Eg. Patidar"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  error={fieldErrors.last_name}
                />
                <Input
                  label="Employee ID"
                  placeholder="Eg. 458ACD98U6"
                  required
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  error={fieldErrors.employee_id}
                />
                <Input
                  label="Aadhaar No."
                  placeholder="12 digits"
                  value={formData.aadhaar_no}
                  onChange={(e) => setFormData({ ...formData, aadhaar_no: e.target.value })}
                  error={fieldErrors.aadhaar_no}
                />
                <Input
                  label="Contact No."
                  placeholder="10 digits"
                  required
                  value={formData.contact_no}
                  onChange={(e) => setFormData({ ...formData, contact_no: e.target.value })}
                  error={fieldErrors.contact_no}
                />

                <Input
                  label="Alt Contact No."
                  placeholder="10 digits"
                  value={formData.alt_contact_no}
                  onChange={(e) => setFormData({ ...formData, alt_contact_no: e.target.value })}
                  error={fieldErrors.alt_contact_no}
                />
                <Input
                  type="email"
                  label="Email"
                  placeholder="xyz@abc.def"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  error={fieldErrors.email}
                />
                <div />

                <div className="md:col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1 leading-none select-none">
                    Address
                  </label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={3}
                    className="w-full bg-(--color-theme-background-base) border border-theme-border rounded-[12px] px-3 py-2 text-theme-text placeholder:text-theme-text-dim focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all duration-150"
                    placeholder="Full address"
                  />
                  {fieldErrors.address && <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.address}</p>}
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1 leading-none select-none">
                    Other Details
                  </label>
                  <textarea
                    value={formData.other_details}
                    onChange={(e) => setFormData({ ...formData, other_details: e.target.value })}
                    rows={3}
                    className="w-full bg-(--color-theme-background-base) border border-theme-border rounded-[12px] px-3 py-2 text-theme-text placeholder:text-theme-text-dim focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all duration-150"
                    placeholder="Any additional notes"
                  />
                  {fieldErrors.other_details && <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.other_details}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Login */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Login Credentials</CardTitle>
                <CardDescription>
                  {isNew
                    ? "Set a password for the employee's system login."
                    : "Leave password blank to keep the existing password unchanged."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Input
                  type="password"
                  label={isNew ? "Password" : "New Password (optional)"}
                  placeholder={isNew ? "Required — min 8 characters" : "Leave blank to keep existing"}
                  required={isNew}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  error={fieldErrors.password}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Organization */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Organization</CardTitle>
                <CardDescription>Assign role, department, and designation.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1.5 w-full">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1 leading-none select-none">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.role_id}
                    onChange={(e) => handleRoleChange(e.target.value ? Number(e.target.value) : "")}
                    required
                    className="w-full bg-(--color-theme-background-base) border border-theme-border rounded-[12px] px-3 py-2 text-theme-text focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all duration-150"
                  >
                    <option value="">Select a role</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.role_id && <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.role_id}</p>}
                </div>

                <div className="space-y-1.5 w-full">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1 leading-none select-none">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value ? Number(e.target.value) : "" })}
                    required
                    className="w-full bg-(--color-theme-background-base) border border-theme-border rounded-[12px] px-3 py-2 text-theme-text focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all duration-150"
                  >
                    <option value="">Select a department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.department_id && <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.department_id}</p>}
                </div>

                <div className="space-y-1.5 w-full">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1 leading-none select-none">
                    Designation
                  </label>
                  <select
                    value={formData.designation_id}
                    onChange={(e) => setFormData({ ...formData, designation_id: e.target.value ? Number(e.target.value) : "" })}
                    className="w-full bg-(--color-theme-background-base) border border-theme-border rounded-[12px] px-3 py-2 text-theme-text focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all duration-150"
                  >
                    <option value="">Select a designation</option>
                    {designations.map((desig) => (
                      <option key={desig.id} value={desig.id}>
                        {desig.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.designation_id && <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.designation_id}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Scope (Dynamic based on role) */}
          {scopeType !== "none" && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Scope Assignment</CardTitle>
                  <CardDescription>
                    {scopeType === "zone"
                      ? "Assign the geographic zone this employee manages."
                      : "Assign the wards this employee is responsible for."}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {scopeType === "zone" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="space-y-1.5 w-full">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1 leading-none select-none">
                        Zone
                      </label>
                      <select
                        value={formData.zone_id}
                        onChange={(e) => setFormData({ ...formData, zone_id: e.target.value ? Number(e.target.value) : "" })}
                        className="w-full bg-(--color-theme-background-base) border border-theme-border rounded-[12px] px-3 py-2 text-theme-text focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all duration-150"
                      >
                        <option value="">Select a zone</option>
                        {zones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.zone_id && <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.zone_id}</p>}
                    </div>
                  </div>
                )}

                {scopeType === "ward" && (
                  <div className="space-y-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block leading-none select-none">
                      Wards (select multiple)
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border border-theme-border rounded-[12px]">
                      {wards.map((ward) => (
                        <label
                          key={ward.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-theme-surface cursor-pointer transition-colors text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={formData.ward_ids.includes(ward.id)}
                            onChange={() => handleWardToggle(ward.id)}
                            className="rounded border-theme-border text-emerald-500 focus:ring-emerald-500/30"
                          />
                          <span className="text-theme-text text-xs">{ward.name}</span>
                        </label>
                      ))}
                    </div>
                    {formData.ward_ids.length > 0 && (
                      <p className="text-xs text-theme-text-dim">
                        {formData.ward_ids.length} ward{formData.ward_ids.length > 1 ? "s" : ""} selected
                      </p>
                    )}
                    {fieldErrors.ward_ids && <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.ward_ids}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Submit Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" variant="primary" loading={submitting} loadingText="Saving...">
              {isNew ? "Create Employee" : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/swift/employee-management/employees")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
