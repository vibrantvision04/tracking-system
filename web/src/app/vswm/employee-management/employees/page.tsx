"use client";
import { useEffect, useState, useMemo } from "react";
import { api, del } from "@/lib/api";
import { toast } from "react-toastify";
import Link from "next/link";
import { useRouter } from "next/navigation";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import EditButton from "@/components/ui/EditButton";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

interface UnifiedEmployee {
  id: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  employee_id: string;
  role_name: string;
  department_name: string;
  is_active: boolean;
  status?: string;
}

interface Department {
  id: number;
  name: string;
}

export default function EmployeeListPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<UnifiedEmployee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page_size", "100");
      if (departmentFilter) params.set("department_id", departmentFilter);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const query = `?${params.toString()}`;
      const res = await api<{ success: boolean; data: UnifiedEmployee[] }>(`/api/employee-management/employees${query}`);
      if (res.success) setEmployees(res.data || []);
    } catch {
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await api<{ success: boolean; data: Department[] }>("/api/departments");
      if (res.success) setDepartments(res.data || []);
    } catch {
      /* silently fail — departments filter just won't populate */
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [departmentFilter, statusFilter]);

  const filteredEmployees = useMemo(() => {
    if (!searchQuery) return employees;
    const q = searchQuery.toLowerCase();
    return employees.filter((emp) => {
      const fullName = `${emp.first_name} ${emp.middle_name} ${emp.last_name}`.toLowerCase();
      return fullName.includes(q) || emp.employee_id.toLowerCase().includes(q);
    });
  }, [employees, searchQuery]);

  const formatFullName = (emp: UnifiedEmployee) =>
    [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";

  const getStatusBadge = (emp: UnifiedEmployee) => {
    const isActive = emp.status ? emp.status === "active" : emp.is_active;
    return isActive ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-600 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Inactive
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Employees"
        description="View and manage all employees across departments and roles."
        breadcrumbs={[{ label: "Employee Management" }, { label: "Employees" }]}
        actions={
          <Link href="/vswm/employee-management/employees/new">
            <Button variant="primary">+ Create Employee</Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4">
            <div>
              <CardTitle>Employee Directory</CardTitle>
              <CardDescription>All registered employees with role and department info.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="Search name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-52"
              />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-2 bg-theme-surface border border-theme-border rounded-xl text-xs text-theme-text outline-none focus:border-emerald-500 transition"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-theme-surface border border-theme-border rounded-xl text-xs text-theme-text outline-none focus:border-emerald-500 transition"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={[
                <div key="s" className="w-12">S.No</div>,
                "Employee ID",
                "Name",
                "Role",
                "Department",
                "Status",
                <div key="a" className="text-right w-28">Action</div>,
              ]}
              isLoading={loading}
              emptyState={
                searchQuery
                  ? "No matching employees found"
                  : "No employees registered"
              }
            >
              {filteredEmployees.map((emp, idx) => (
                <tr
                  key={emp.id}
                  className="hover:bg-theme-base/40 transition-colors group text-theme-text-dim text-xs"
                >
                  <td className="py-3 px-5 font-mono text-[11px]">{idx + 1}</td>
                  <td className="py-3 px-5 font-semibold text-theme-text">{emp.employee_id}</td>
                  <td className="py-3 px-5 font-medium text-theme-text">{formatFullName(emp)}</td>
                  <td className="py-3 px-5">{emp.role_name || "—"}</td>
                  <td className="py-3 px-5">{emp.department_name || "—"}</td>
                  <td className="py-3 px-5">{getStatusBadge(emp)}</td>
                  <td className="py-3 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditButton onClick={() => router.push(`/vswm/employee-management/employees/${emp.id}`)} />
                      <DeleteButton
                        onDelete={async () => {
                          await del(`/api/employee-management/employees/${emp.id}`);
                          toast.success("Employee deleted");
                          fetchEmployees();
                        }}
                        confirmMessage={`Delete employee "${emp.first_name} ${emp.last_name}"?`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{filteredEmployees.length} total</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest font-mono">
                EMPLOYEE MANAGEMENT
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
