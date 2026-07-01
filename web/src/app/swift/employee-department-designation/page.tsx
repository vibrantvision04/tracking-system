"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

interface Employee {
  id: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  employee_id: string;
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
  region_name: string;
  parent_region_name?: string;
  region_type_id: number;
}

interface EmployeeDepartmentDesignation {
  id: number;
  employee_id: number;
  employee_name: string;
  department_id: number;
  department_name: string;
  designation_id: number;
  designation_name: string;
  region_id: number;
  region_name: string;
}

export default function EmployeeDepartmentDesignationPage() {
  const [mappings, setMappings] = useState<EmployeeDepartmentDesignation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedDesignationId, setSelectedDesignationId] = useState<number | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [designationSearch, setDesignationSearch] = useState("");
  const [regionSearch, setRegionSearch] = useState("");

  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [designationDropdownOpen, setDesignationDropdownOpen] = useState(false);
  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);

  const [tableFilter, setTableFilter] = useState("");

  const employeeRef = useRef<HTMLDivElement>(null);
  const departmentRef = useRef<HTMLDivElement>(null);
  const designationRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (employeeRef.current && !employeeRef.current.contains(e.target as Node)) {
        setEmployeeDropdownOpen(false);
      }
      if (departmentRef.current && !departmentRef.current.contains(e.target as Node)) {
        setDepartmentDropdownOpen(false);
      }
      if (designationRef.current && !designationRef.current.contains(e.target as Node)) {
        setDesignationDropdownOpen(false);
      }
      if (regionRef.current && !regionRef.current.contains(e.target as Node)) {
        setRegionDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eddRes, empRes, deptRes, desigRes, regRes] = await Promise.all([
        api<{ data: EmployeeDepartmentDesignation[] }>("/api/employee-department-designations"),
        api<{ success: boolean; data: Employee[] }>("/api/employees?all=true"),
        api<{ success: boolean; data: Department[] }>("/api/departments?all=true"),
        api<{ success: boolean; data: Designation[] }>("/api/designations?all=true"),
        api<{ success: boolean; data: Region[] }>("/api/regions")
      ]);
      setMappings(eddRes.data || []);
      setEmployees(empRes.data || []);
      setDepartments(deptRes.data || []);
      setDesignations(desigRes.data || []);
      setRegions(regRes.data || []);
    } catch {
      toast.error("Failed to load page data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const closeForm = () => {
    setFormOpen(false);
    setSelectedEmployeeId(null);
    setSelectedDepartmentId(null);
    setSelectedDesignationId(null);
    setSelectedRegionId(null);
    setEmployeeSearch("");
    setDepartmentSearch("");
    setDesignationSearch("");
    setRegionSearch("");
  };

  const handleSubmit = async () => {
    if (!selectedEmployeeId || !selectedDepartmentId || !selectedDesignationId || !selectedRegionId) {
      toast.warning("All selections (Employee, Department, Designation, and Region) are required.");
      return;
    }
    setSubmitting(true);
    try {
      await post("/api/employee-department-designations", {
        employee_id: selectedEmployeeId,
        department_id: selectedDepartmentId,
        designation_id: selectedDesignationId,
        region_id: selectedRegionId
      });
      toast.success("Assigned successfully!");
      closeForm();
      loadData();
    } catch {
      toast.error("Failed to assign employee settings.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (mapping: EmployeeDepartmentDesignation) => {
    try {
      await del(`/api/employee-department-designations/${mapping.id}`);
      toast.success("Removed assignment.");
      loadData();
    } catch {
      toast.error("Failed to remove assignment.");
    }
  };

  const filteredMappings = mappings.filter(m => {
    const search = tableFilter.toLowerCase();
    return (
      m.employee_name?.toLowerCase().includes(search) ||
      m.department_name?.toLowerCase().includes(search) ||
      m.designation_name?.toLowerCase().includes(search) ||
      m.region_name?.toLowerCase().includes(search)
    );
  });

  const getEmployeeName = (emp: Employee) => {
    return `${emp.first_name} ${emp.middle_name ? emp.middle_name + " " : ""}${emp.last_name} (${emp.employee_id})`;
  };

  const getRegionName = (reg: Region) => {
    if (reg.parent_region_name) {
      return `${reg.region_name} (Zone: ${reg.parent_region_name})`;
    }
    return reg.region_name;
  };

  const filteredEmployees = employees.filter(emp =>
    getEmployeeName(emp).toLowerCase().includes(employeeSearch.toLowerCase())
  );

  const filteredDepartments = departments.filter(d =>
    d.name.toLowerCase().includes(departmentSearch.toLowerCase())
  );

  const filteredDesignations = designations.filter(des =>
    des.name.toLowerCase().includes(designationSearch.toLowerCase())
  );

  const filteredRegions = regions.filter(reg =>
    getRegionName(reg).toLowerCase().includes(regionSearch.toLowerCase())
  );

  const selectedEmployeeName = (() => {
    const emp = employees.find(e => e.id === selectedEmployeeId);
    return emp ? getEmployeeName(emp) : "Select Employee";
  })();

  const selectedDepartmentName = departments.find(d => d.id === selectedDepartmentId)?.name || "Select Department";
  const selectedDesignationName = designations.find(d => d.id === selectedDesignationId)?.name || "Select Designation";

  const selectedRegionName = (() => {
    const reg = regions.find(r => r.id === selectedRegionId);
    return reg ? getRegionName(reg) : "Select Region";
  })();

  const SearchableDropdown = ({ label, required, selectedName, isSelected, isOpen, setOpen, search, setSearch, items, onSelect, dropdownRef, itemTextFn, searchPlaceholder }: any) => {
    return (
      <div className="flex flex-col relative" ref={dropdownRef}>
        <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
          {label} {required && <span className="text-red-400">*</span>}
        </span>
        <div
          className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition"
          onClick={() => setOpen(!isOpen)}
        >
          <span className={isSelected ? "text-theme-text font-medium truncate" : "text-theme-text-dim truncate"}>{selectedName}</span>
          <span className="text-theme-text-dim text-xs flex-shrink-0 ml-2">{isOpen ? "▲" : "▼"}</span>
        </div>
        {isOpen && (
          <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
            <div className="p-2 border-b border-theme-border">
              <input
                type="text"
                placeholder={searchPlaceholder || `🔍 Search ${label}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-theme-text outline-none placeholder:text-theme-text-dim"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {items.length === 0 ? (
                <div className="px-4 py-2.5 text-xs text-theme-text-dim italic">No options found</div>
              ) : (
                items.map((item: any) => {
                  const text = itemTextFn ? itemTextFn(item) : (item.name || item.region_name);
                  const isCurSelected = (() => {
                    if (label === "Employee") return selectedEmployeeId === item.id;
                    if (label === "Department") return selectedDepartmentId === item.id;
                    if (label === "Designation") return selectedDesignationId === item.id;
                    return selectedRegionId === item.id;
                  })();
                  return (
                    <div
                      key={item.id}
                      className={`px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition ${isCurSelected ? "bg-theme-accent/10 text-emerald-400" : ""}`}
                      onClick={() => onSelect(item.id)}
                    >
                      {text}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Employee to Department & Designation"
        description="Map employees to their respective working departments, designations, and zones/wards."
        breadcrumbs={[{ label: "SWIFT", href: "/swift/shift" }, { label: "Employee-Department-Designation" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Assign Employee to Department & Designation"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {formOpen && (
          <Card className="animate-fade-in relative z-20 !overflow-visible">
            <CardHeader>
              <CardTitle>Assign Employee to Department & Designation</CardTitle>
              <CardDescription>Select an employee, department, designation, and region to map the assignment.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-4">
                <SearchableDropdown
                  label="Employee"
                  required
                  selectedName={selectedEmployeeName}
                  isSelected={!!selectedEmployeeId}
                  isOpen={employeeDropdownOpen}
                  setOpen={setEmployeeDropdownOpen}
                  search={employeeSearch}
                  setSearch={setEmployeeSearch}
                  items={filteredEmployees}
                  dropdownRef={employeeRef}
                  itemTextFn={getEmployeeName}
                  searchPlaceholder="Search Employee"
                  onSelect={(id: number) => {
                    if (selectedEmployeeId === id) {
                      setSelectedEmployeeId(null);
                    } else {
                      setSelectedEmployeeId(id);
                    }
                    setEmployeeDropdownOpen(false);
                    setEmployeeSearch("");
                  }}
                />
                <SearchableDropdown
                  label="Department"
                  required
                  selectedName={selectedDepartmentName}
                  isSelected={!!selectedDepartmentId}
                  isOpen={departmentDropdownOpen}
                  setOpen={setDepartmentDropdownOpen}
                  search={departmentSearch}
                  setSearch={setDepartmentSearch}
                  items={filteredDepartments}
                  dropdownRef={departmentRef}
                  searchPlaceholder="Search Department"
                  onSelect={(id: number) => {
                    if (selectedDepartmentId === id) {
                      setSelectedDepartmentId(null);
                    } else {
                      setSelectedDepartmentId(id);
                    }
                    setDepartmentDropdownOpen(false);
                    setDepartmentSearch("");
                  }}
                />
                <SearchableDropdown
                  label="Designation"
                  required
                  selectedName={selectedDesignationName}
                  isSelected={!!selectedDesignationId}
                  isOpen={designationDropdownOpen}
                  setOpen={setDesignationDropdownOpen}
                  search={designationSearch}
                  setSearch={setDesignationSearch}
                  items={filteredDesignations}
                  dropdownRef={designationRef}
                  searchPlaceholder="Search Designation"
                  onSelect={(id: number) => {
                    if (selectedDesignationId === id) {
                      setSelectedDesignationId(null);
                    } else {
                      setSelectedDesignationId(id);
                    }
                    setDesignationDropdownOpen(false);
                    setDesignationSearch("");
                  }}
                />
                <SearchableDropdown
                  label="Region(Zone/Ward)"
                  required
                  selectedName={selectedRegionName}
                  isSelected={!!selectedRegionId}
                  isOpen={regionDropdownOpen}
                  setOpen={setRegionDropdownOpen}
                  search={regionSearch}
                  setSearch={setRegionSearch}
                  items={filteredRegions}
                  dropdownRef={regionRef}
                  itemTextFn={getRegionName}
                  searchPlaceholder="Search Region"
                  onSelect={(id: number) => {
                    if (selectedRegionId === id) {
                      setSelectedRegionId(null);
                    } else {
                      setSelectedRegionId(id);
                    }
                    setRegionDropdownOpen(false);
                    setRegionSearch("");
                  }}
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-theme-border">
                <Button onClick={handleSubmit} variant="accent" loading={submitting} loadingText="Submitting...">
                  Submit
                </Button>
                <Button onClick={closeForm} variant="outline">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Employee Settings Assignments</CardTitle>
              <CardDescription>All mappings configured between employees, departments, designations, and regions.</CardDescription>
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
                {mappings.length} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. NO.</div>,
                  "EMPLOYEE",
                  "DEPARTMENT",
                  "DESIGNATION",
                  "REGION(ZONE/WARD)",
                  <div key="a" className="text-right pr-4 w-24">ACTION</div>
                ]}
                isLoading={loading}
                emptyState="No data to display"
              >
                {filteredMappings.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-semibold text-theme-text">
                      {m.employee_name}
                    </td>
                    <td className="py-3 px-5 text-theme-text-dim font-medium">
                      {m.department_name}
                    </td>
                    <td className="py-3 px-5 text-theme-text-dim">
                      {m.designation_name}
                    </td>
                    <td className="py-3 px-5 text-theme-text-dim text-xs font-semibold">
                      {m.region_name}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <DeleteButton
                        onDelete={() => handleDelete(m)}
                        confirmMessage={`Remove settings assignment for ${m.employee_name}?`}
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
