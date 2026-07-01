"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Input from "@/components/ui/Input";
import TextArea from "@/components/ui/TextArea";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Role {
  id: number;
  name: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  scope_type: string;
  employee_count: number;
}

interface Permission {
  id: number;
  code: string;
  name: string;
  category_id: number;
  category_name: string;
}

interface RolePermission {
  id: number;
  permission_id: number;
  is_granted: boolean;
}

interface RoleEmployee {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  department_name: string;
}

type Tab = "permissions" | "members" | "settings";

// ─── Component ───────────────────────────────────────────────────────────────

export default function RoleConfigurationPage() {
  // ─── Role List State ─────────────────────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roleSearch, setRoleSearch] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);

  // ─── Create Role State ───────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // ─── Right Panel State ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("permissions");

  // ─── Permissions State ───────────────────────────────────────────────────
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [grantedPermIds, setGrantedPermIds] = useState<Set<number>>(new Set());
  const [permsLoading, setPermsLoading] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // ─── Members State ───────────────────────────────────────────────────────
  const [members, setMembers] = useState<RoleEmployee[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // ─── Settings State ──────────────────────────────────────────────────────
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsScopeType, setSettingsScopeType] = useState("none");

  // ─── Save State ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // ─── Derived ─────────────────────────────────────────────────────────────
  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  );

  const filteredRoles = useMemo(() => {
    if (!roleSearch) return roles;
    const q = roleSearch.toLowerCase();
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
    );
  }, [roles, roleSearch]);

  const permissionsByCategory = useMemo(() => {
    const map: Record<string, Permission[]> = {};
    for (const p of allPermissions) {
      const cat = p.category_name || "Uncategorized";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    return map;
  }, [allPermissions]);

  // ─── Data Loaders ────────────────────────────────────────────────────────

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const res = await api<{ success: boolean; data: Role[] }>("/api/rbac/roles");
      setRoles(res.data || []);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const loadAllPermissions = useCallback(async () => {
    try {
      // API returns categories with nested permissions:
      // { data: [{ id, name, permissions: [{id, code, name, ...}] }] }
      // We need to flatten into: [{id, code, name, category_name}]
      interface ApiCategory {
        id: number;
        name: string;
        permissions: Array<{ id: number; code: string; name: string; description?: string }>;
      }
      const res = await api<{ success: boolean; data: ApiCategory[] }>("/api/rbac/permissions");
      const flat: Permission[] = [];
      for (const cat of res.data || []) {
        // Hide "Mobile" category — mobile app uses role name, not granular permissions
        if (cat.name === "Mobile") continue;
        for (const perm of cat.permissions || []) {
          flat.push({
            id: perm.id,
            code: perm.code,
            name: perm.name,
            category_id: cat.id,
            category_name: cat.name,
          });
        }
      }
      setAllPermissions(flat);
    } catch {
      toast.error("Failed to load permissions");
    }
  }, []);

  const loadRolePermissions = useCallback(async (roleId: number) => {
    setPermsLoading(true);
    try {
      const res = await api<{ success: boolean; data: RolePermission[] }>(
        `/api/rbac/roles/${roleId}/permissions`
      );
      const granted = new Set(
        (res.data || []).filter((rp) => rp.is_granted).map((rp) => rp.permission_id)
      );
      setGrantedPermIds(granted);
    } catch {
      toast.error("Failed to load role permissions");
    } finally {
      setPermsLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (roleId: number) => {
    setMembersLoading(true);
    try {
      const res = await api<{ success: boolean; data: RoleEmployee[] }>(
        `/api/rbac/roles/${roleId}/employees`
      );
      setMembers(res.data || []);
    } catch {
      toast.error("Failed to load role members");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  // ─── Effects ─────────────────────────────────────────────────────────────

  useEffect(() => {
    loadRoles();
    loadAllPermissions();
  }, [loadRoles, loadAllPermissions]);

  useEffect(() => {
    if (selectedRoleId) {
      loadRolePermissions(selectedRoleId);
      loadMembers(selectedRoleId);
      // Populate settings from selected role
      const role = roles.find((r) => r.id === selectedRoleId);
      if (role) {
        setSettingsName(role.name);
        setSettingsDescription(role.description || "");
        setSettingsScopeType(role.scope_type || "none");
      }
    }
  }, [selectedRoleId, roles, loadRolePermissions, loadMembers]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      toast.warning("Role name is required");
      return;
    }
    setCreateSubmitting(true);
    try {
      const res = await post<{ success: boolean; data: { id: number } }>("/api/rbac/roles", {
        name: newRoleName.trim(),
        description: "",
      });
      toast.success("Role created");
      setCreating(false);
      setNewRoleName("");
      await loadRoles();
      // Select the new role and show permissions tab
      if (res?.data?.id) {
        setSelectedRoleId(res.data.id);
        setActiveTab("permissions");
      }
    } catch {
      toast.error("Failed to create role");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleSelectRole = (roleId: number) => {
    setSelectedRoleId(roleId);
    setActiveTab("permissions");
  };

  const togglePermission = (permId: number) => {
    setGrantedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const toggleCategory = (catName: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });
  };

  const toggleAllInCategory = (catPerms: Permission[]) => {
    const allGranted = catPerms.every((p) => grantedPermIds.has(p.id));
    setGrantedPermIds((prev) => {
      const next = new Set(prev);
      for (const p of catPerms) {
        if (allGranted) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      // Save role settings
      await put(`/api/rbac/roles/${selectedRoleId}`, {
        name: settingsName.trim(),
        description: settingsDescription.trim(),
        scope_type: settingsScopeType,
        is_active: selectedRole?.is_active ?? true,
      });
      // Save permissions atomically
      await put(`/api/rbac/roles/${selectedRoleId}/permissions`, {
        permission_ids: Array.from(grantedPermIds),
      });
      toast.success("Role saved successfully");
      await loadRoles();
    } catch {
      toast.error("Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedRoleId || !selectedRole) return;
    const newName = prompt("Enter name for duplicated role:", `${selectedRole.name} (Copy)`);
    if (!newName?.trim()) return;
    try {
      await post(`/api/rbac/roles/${selectedRoleId}/duplicate`, { name: newName.trim() });
      toast.success("Role duplicated");
      await loadRoles();
    } catch {
      toast.error("Failed to duplicate role");
    }
  };

  const handleDelete = async () => {
    if (!selectedRoleId || !selectedRole) return;
    if (selectedRole.is_system) {
      toast.warning("System roles cannot be deleted");
      return;
    }
    try {
      await del(`/api/rbac/roles/${selectedRoleId}`);
      toast.success("Role deleted");
      setSelectedRoleId(null);
      await loadRoles();
    } catch {
      toast.error("Failed to delete role");
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: "permissions", label: "Permissions" },
    { key: "members", label: "Members" },
    { key: "settings", label: "Settings" },
  ];

  const getScopeLabel = (scopeType: string) => {
    switch (scopeType) {
      case "zone": return "Zone";
      case "ward": return "Ward";
      default: return "Global";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans">
      {/* Header */}
      <div className="p-6 lg:p-8 pb-0">
        <PageHeader
          title="Roles & Permissions"
          description="Configure roles, assign permissions, and manage role membership."
          breadcrumbs={[
            { label: "Employee Management", href: "/swift/employee-management/employees" },
            { label: "Roles & Permissions" },
          ]}
        />
      </div>

      {/* Discord-style split layout */}
      <div className="flex-1 flex overflow-hidden mt-6">
        {/* ─── LEFT PANEL: Role List ─────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 border-r border-theme-border flex flex-col bg-theme-surface/50">
          {/* Search + Create */}
          <div className="p-4 space-y-3 border-b border-theme-border">
            <Input
              placeholder="Search roles..."
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
            />
            {creating ? (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Role name..."
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateRole()}
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreateRole}
                  loading={createSubmitting}
                  loadingText="..."
                >
                  ✓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setCreating(false); setNewRoleName(""); }}
                >
                  ✕
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => setCreating(true)}
              >
                + Create Role
              </Button>
            )}
          </div>

          {/* Role list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {rolesLoading ? (
              <div className="text-center text-theme-text-dim text-xs py-8">Loading roles...</div>
            ) : filteredRoles.length === 0 ? (
              <div className="text-center text-theme-text-dim text-xs py-8">No roles found</div>
            ) : (
              filteredRoles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleSelectRole(role.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all cursor-pointer group ${
                    selectedRoleId === role.id
                      ? "bg-emerald-500/10 border border-emerald-500/30"
                      : "hover:bg-theme-surface border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold truncate ${
                      selectedRoleId === role.id ? "text-emerald-400" : "text-theme-text"
                    }`}>
                      {role.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {role.is_system && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 uppercase">
                          System
                        </span>
                      )}
                      {!role.is_system && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-theme-base text-theme-text-dim uppercase">
                          Custom
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-theme-text-dim">
                      {role.employee_count || 0} member{role.employee_count !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[10px] text-theme-text-dim">•</span>
                    <span className="text-[10px] text-theme-text-dim">
                      {getScopeLabel(role.scope_type)}
                    </span>
                    {!role.is_active && (
                      <>
                        <span className="text-[10px] text-theme-text-dim">•</span>
                        <span className="text-[10px] font-bold text-red-400">Inactive</span>
                      </>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ─── RIGHT PANEL: Role Detail ──────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedRole ? (
            <div className="flex-1 flex items-center justify-center text-theme-text-dim text-sm">
              Select a role from the list to configure
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex items-center gap-1 px-6 pt-4 border-b border-theme-border">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`px-4 py-2.5 text-sm font-semibold transition rounded-t-lg border-b-2 ${
                      activeTab === t.key
                        ? "text-emerald-400 border-emerald-400 bg-theme-surface"
                        : "text-theme-text-dim border-transparent hover:text-theme-text hover:bg-theme-surface/50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                <div className="flex-1" />
                <span className="text-xs text-theme-text-dim font-semibold mr-2">
                  {selectedRole.name}
                </span>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                {/* ─── PERMISSIONS TAB ──────────────────────────────── */}
                {activeTab === "permissions" && (
                  <>
                    {permsLoading ? (
                      <div className="text-center text-theme-text-dim text-xs py-12">
                        Loading permissions...
                      </div>
                    ) : (
                      Object.entries(permissionsByCategory).map(([catName, catPerms]) => {
                        const isCollapsed = collapsedCategories.has(catName);
                        const grantedCount = catPerms.filter((p) => grantedPermIds.has(p.id)).length;
                        const allGranted = catPerms.every((p) => grantedPermIds.has(p.id));

                        return (
                          <div
                            key={catName}
                            className="border border-theme-border rounded-xl overflow-hidden bg-theme-surface/30"
                          >
                            {/* Category header */}
                            <div
                              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-theme-surface/50 transition"
                              onClick={() => toggleCategory(catName)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-theme-text-dim">
                                  {isCollapsed ? "▶" : "▼"}
                                </span>
                                <span className="text-sm font-bold text-theme-text">
                                  {catName}
                                </span>
                                <span className="text-[10px] font-semibold text-theme-text-dim bg-theme-base px-2 py-0.5 rounded-full">
                                  {grantedCount}/{catPerms.length}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAllInCategory(catPerms);
                                }}
                                className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition px-2 py-1"
                              >
                                {allGranted ? "Deselect All" : "Select All"}
                              </button>
                            </div>

                            {/* Permission toggles */}
                            {!isCollapsed && (
                              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {catPerms.map((perm) => (
                                  <label
                                    key={perm.id}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition ${
                                      grantedPermIds.has(perm.id)
                                        ? "bg-emerald-500/10 border-emerald-500/30"
                                        : "bg-theme-base border-theme-border hover:border-theme-accent/30"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={grantedPermIds.has(perm.id)}
                                      onChange={() => togglePermission(perm.id)}
                                      className="w-4 h-4 accent-emerald-500 rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-medium text-theme-text truncate">
                                        {perm.name}
                                      </div>
                                      <div className="text-[10px] text-theme-text-dim font-mono truncate">
                                        {perm.code}
                                      </div>
                                    </div>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </>
                )}

                {/* ─── MEMBERS TAB ─────────────────────────────────── */}
                {activeTab === "members" && (
                  <>
                    {membersLoading ? (
                      <div className="text-center text-theme-text-dim text-xs py-12">
                        Loading members...
                      </div>
                    ) : members.length === 0 ? (
                      <div className="text-center text-theme-text-dim text-sm py-12">
                        No employees assigned to this role
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-3">
                          {members.length} Employee{members.length !== 1 ? "s" : ""} Assigned
                        </div>
                        {members.map((emp) => (
                          <div
                            key={emp.id}
                            className="flex items-center justify-between px-4 py-3 rounded-lg border border-theme-border bg-theme-surface/30 hover:bg-theme-surface/50 transition"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">
                                {emp.first_name?.[0]}{emp.last_name?.[0]}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-theme-text">
                                  {emp.first_name} {emp.last_name}
                                </div>
                                <div className="text-[10px] text-theme-text-dim">
                                  {emp.employee_id} • {emp.department_name || "No department"}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* ─── SETTINGS TAB ────────────────────────────────── */}
                {activeTab === "settings" && (
                  <div className="max-w-lg space-y-5">
                    <div>
                      <Input
                        label="Role Name"
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        placeholder="e.g., Fleet Manager"
                        disabled={selectedRole.is_system}
                      />
                    </div>
                    <div>
                      <TextArea
                        label="Description"
                        value={settingsDescription}
                        onChange={(e) => setSettingsDescription(e.target.value)}
                        placeholder="Describe the purpose of this role..."
                        disabled={selectedRole.is_system}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1.5 leading-none select-none">
                        Scope Type
                      </label>
                      <select
                        value={settingsScopeType}
                        onChange={(e) => setSettingsScopeType(e.target.value)}
                        className="w-full px-3 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition"
                        disabled={selectedRole.is_system}
                      >
                        <option value="none">None (Global access)</option>
                        <option value="zone">Zone</option>
                        <option value="ward">Ward</option>
                      </select>
                      <p className="text-[10px] text-theme-text-dim mt-1.5">
                        Controls which scope fields appear on the Employee Form for this role.
                      </p>
                    </div>

                    <div className="border-t border-theme-border pt-5 flex items-center gap-3">
                      <Button variant="secondary" onClick={handleDuplicate}>
                        Duplicate Role
                      </Button>
                      <DeleteButton
                        onDelete={handleDelete}
                        confirmMessage={`Delete role "${selectedRole.name}"? This cannot be undone.`}
                        variant="danger-button"
                      />
                    </div>

                    {selectedRole.is_system && (
                      <p className="text-[10px] text-yellow-500 font-semibold">
                        System roles cannot be edited or deleted.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Save button (bottom of right panel) */}
              <div className="px-6 py-4 border-t border-theme-border bg-theme-surface/50 flex items-center justify-between">
                <span className="text-[10px] text-theme-text-dim uppercase tracking-widest font-mono">
                  {selectedRole.is_system ? "SYSTEM ROLE" : "CUSTOM ROLE"}
                </span>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={saving}
                  loadingText="Saving..."
                  disabled={selectedRole.is_system}
                >
                  Save Changes
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
