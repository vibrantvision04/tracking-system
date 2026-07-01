"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import TextArea from "@/components/ui/TextArea";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface Role {
  id: number;
  name: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Permission {
  id: number;
  category_id: number;
  code: string;
  name: string;
  description: string;
  module: string;
  permission_type: string;
  is_menu: boolean;
  menu_path: string;
  display_order: number;
}

interface PermissionCategory {
  id: number;
  name: string;
  display_order: number;
  permissions: Permission[];
}

interface UserRole {
  user_id: number;
  role_id: number;
  created_at: string;
  role_name: string;
  email: string;
}

type Tab = "roles" | "permissions" | "users";

export default function RBACPage() {
  const [tab, setTab] = useState<Tab>("roles");

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [roleSearch, setRoleSearch] = useState("");

  // Permissions state
  const [categories, setCategories] = useState<PermissionCategory[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [grantedPermIds, setGrantedPermIds] = useState<Set<number>>(new Set());
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);

  // Users state
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [assignFormOpen, setAssignFormOpen] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignPassword, setAssignPassword] = useState("");
  const [assignRoleId, setAssignRoleId] = useState<number | null>(null);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // --- Roles ---
  const loadRoles = async () => {
    setRolesLoading(true);
    try {
      const res = await api<{ success: boolean; data: Role[] }>("/api/rbac/roles");
      setRoles(res.data || []);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => { loadRoles(); }, []);

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleName("");
    setRoleDescription("");
    setRoleFormOpen(true);
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description);
    setRoleFormOpen(true);
  };

  const closeRoleForm = () => {
    setRoleFormOpen(false);
    setEditingRole(null);
    setRoleName("");
    setRoleDescription("");
  };

  const handleRoleSubmit = async () => {
    if (!roleName.trim()) { toast.warning("Role name is required"); return; }
    setRoleSubmitting(true);
    try {
      if (editingRole) {
        await put(`/api/rbac/roles/${editingRole.id}`, { name: roleName.trim(), description: roleDescription.trim() });
        toast.success("Role updated");
      } else {
        await post("/api/rbac/roles", { name: roleName.trim(), description: roleDescription.trim() });
        toast.success("Role created");
      }
      closeRoleForm();
      loadRoles();
    } catch {
      toast.error("Failed to save role");
    } finally {
      setRoleSubmitting(false);
    }
  };

  const handleDuplicateRole = async (role: Role) => {
    const newName = prompt("Enter name for duplicated role:", `${role.name} (Copy)`);
    if (!newName?.trim()) return;
    try {
      await post(`/api/rbac/roles/${role.id}/duplicate`, { name: newName.trim() });
      toast.success("Role duplicated");
      loadRoles();
    } catch {
      toast.error("Failed to duplicate role");
    }
  };

  const handleDeleteRole = async (role: Role) => {
    try {
      await del(`/api/rbac/roles/${role.id}`);
      toast.success("Role deleted");
      loadRoles();
    } catch {
      toast.error("Failed to delete role");
    }
  };

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(roleSearch.toLowerCase()) ||
    r.description.toLowerCase().includes(roleSearch.toLowerCase())
  );

  // --- Permissions ---
  const loadCategories = async () => {
    setPermsLoading(true);
    try {
      const res = await api<{ success: boolean; data: PermissionCategory[] }>("/api/rbac/permissions");
      setCategories(res.data || []);
    } catch {
      toast.error("Failed to load permissions");
    } finally {
      setPermsLoading(false);
    }
  };

  const loadRolePermissions = async (roleId: number) => {
    setPermsLoading(true);
    try {
      const res = await api<{ success: boolean; data: { id: number; permission_id: number; is_granted: boolean }[] }>(
        `/api/rbac/roles/${roleId}/permissions`
      );
      const granted = new Set(
        (res.data || []).filter(rp => rp.is_granted).map(rp => rp.permission_id)
      );
      setGrantedPermIds(granted);
    } catch {
      toast.error("Failed to load role permissions");
    } finally {
      setPermsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "permissions") {
      loadCategories();
      if (roles.length > 0 && !selectedRoleId) {
        setSelectedRoleId(roles[0].id);
      }
    }
  }, [tab]);

  useEffect(() => {
    if (selectedRoleId) {
      loadRolePermissions(selectedRoleId);
    }
  }, [selectedRoleId]);

  const togglePermission = (permId: number) => {
    setGrantedPermIds(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedRoleId) return;
    setPermsSaving(true);
    try {
      await put(`/api/rbac/roles/${selectedRoleId}/permissions`, {
        permission_ids: Array.from(grantedPermIds),
      });
      toast.success("Permissions saved");
    } catch {
      toast.error("Failed to save permissions");
    } finally {
      setPermsSaving(false);
    }
  };

  // --- Users ---
  const loadUserRoles = async () => {
    setUsersLoading(true);
    try {
      const res = await api<{ success: boolean; data: UserRole[] }>("/api/rbac/users");
      setUserRoles(res.data || []);
    } catch {
      toast.error("Failed to load user roles");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => { if (tab === "users") loadUserRoles(); }, [tab]);

  const handleAssignRole = async () => {
    if (!assignEmail.trim() || !assignRoleId) {
      toast.warning("Email and role are required");
      return;
    }
    setAssignSubmitting(true);
    try {
      // Create or update user in users table (with password for new users)
      try {
        await post("/api/users", {
          email: assignEmail.trim(),
          role: roles.find(r => r.id === assignRoleId)?.name || "",
          password: assignPassword || undefined,
        });
      } catch {
        // User might already exist — ignore
      }
      // Assign role via RBAC
      await post("/api/rbac/users/assign-role", {
        email: assignEmail.trim(),
        role_id: assignRoleId,
      });
      toast.success("Role assigned");
      setAssignFormOpen(false);
      setAssignEmail("");
      setAssignPassword("");
      setAssignRoleId(null);
      loadUserRoles();
    } catch {
      toast.error("Failed to assign role");
    } finally {
      setAssignSubmitting(false);
    }
  };

  const filteredUsers = userRoles.filter(u =>
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role_name?.toLowerCase().includes(userSearch.toLowerCase())
  );

  // --- Tabs ---
  const tabs: { key: Tab; label: string }[] = [
    { key: "roles", label: "Roles" },
    { key: "permissions", label: "Permissions" },
    { key: "users", label: "User Assignment" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans p-6 lg:p-8">
      <PageHeader
        title="Role-Based Access Control"
        description="Manage roles, configure permissions, and assign users."
        breadcrumbs={[{ label: "SWIFT", href: "/swift" }, { label: "RBAC" }]}
      />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-theme-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-semibold transition rounded-t-lg border-b-2 ${
              tab === t.key
                ? "text-emerald-400 border-emerald-400 bg-theme-surface"
                : "text-theme-text-dim border-transparent hover:text-theme-text hover:bg-theme-surface/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ==================== TAB: ROLES ==================== */}
      {tab === "roles" && (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
          <div className="flex items-center justify-between">
            <div className="text-sm text-theme-text-dim">
              {roles.length} role{roles.length !== 1 ? "s" : ""} configured
            </div>
            {!roleFormOpen && (
              <Button onClick={openCreateRole} variant="primary">+ Create Role</Button>
            )}
          </div>

          {roleFormOpen && (
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle>{editingRole ? "Edit Role" : "Create Role"}</CardTitle>
                <CardDescription>
                  {editingRole ? "Update the role name and description." : "Define a new role for access control."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Input
                    label="Role Name"
                    value={roleName}
                    onChange={e => setRoleName(e.target.value)}
                    placeholder="e.g., Fleet Manager"
                  />
                  <TextArea
                    label="Description"
                    value={roleDescription}
                    onChange={e => setRoleDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-theme-border">
                  <Button onClick={handleRoleSubmit} variant="accent" loading={roleSubmitting} loadingText="Saving...">
                    {editingRole ? "Update" : "Create"}
                  </Button>
                  <Button onClick={closeRoleForm} variant="outline">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="py-4">
              <div className="w-full">
                <CardTitle>Roles Directory</CardTitle>
                <CardDescription>All roles in the system. System roles cannot be deleted.</CardDescription>
              </div>
              <Input
                placeholder="Search roles..."
                value={roleSearch}
                onChange={e => setRoleSearch(e.target.value)}
                className="w-full sm:w-72"
              />
            </CardHeader>
            <CardContent className="p-0">
              <Table
                headers={["Name", "Description", "System", "Active", "Actions"]}
                isLoading={rolesLoading}
                emptyState="No roles found"
              >
                {filteredRoles.map(role => (
                  <tr key={role.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 font-semibold text-[13px]">{role.name}</td>
                    <td className="py-3 px-5 text-theme-text-dim text-[13px]">{role.description || "—"}</td>
                    <td className="py-3 px-5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        role.is_system ? "bg-purple-500/20 text-purple-400" : "bg-theme-base text-theme-text-dim"
                      }`}>
                        {role.is_system ? "SYSTEM" : "Custom"}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        role.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {role.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        {!role.is_system && (
                          <>
                            <EditButton onClick={() => openEditRole(role)} variant="icon" />
                            <DeleteButton onDelete={() => handleDeleteRole(role)} confirmMessage={`Delete role "${role.name}"?`} variant="icon" />
                          </>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicateRole(role)}>
                          Duplicate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ==================== TAB: PERMISSIONS ==================== */}
      {tab === "permissions" && (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-semibold text-theme-text">Select Role:</span>
            <div className="flex gap-2 flex-wrap">
              {roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition ${
                    selectedRoleId === role.id
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                      : "bg-theme-surface border-theme-border text-theme-text-dim hover:border-theme-accent/40"
                  }`}
                >
                  {role.name}
                </button>
              ))}
            </div>
            {selectedRoleId && (
              <Button
                variant="accent"
                size="sm"
                loading={permsSaving}
                loadingText="Saving..."
                onClick={handleSavePermissions}
              >
                Save Permissions
              </Button>
            )}
          </div>

          {selectedRoleId && (
            <div className="space-y-4">
              {permsLoading ? (
                <div className="text-center text-theme-text-dim py-12">Loading permissions...</div>
              ) : (
                categories.map(cat => {
                  const catPerms = cat.permissions || [];
                  const grantedCount = catPerms.filter(p => grantedPermIds.has(p.id)).length;
                  return (
                    <Card key={cat.id}>
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{cat.name}</CardTitle>
                            <CardDescription>
                              {grantedCount}/{catPerms.length} granted
                            </CardDescription>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const allGranted = catPerms.every(p => grantedPermIds.has(p.id));
                              setGrantedPermIds(prev => {
                                const next = new Set(prev);
                                for (const p of catPerms) {
                                  if (allGranted) next.delete(p.id);
                                  else next.add(p.id);
                                }
                                return next;
                              });
                            }}
                          >
                            {catPerms.every(p => grantedPermIds.has(p.id)) ? "Deselect All" : "Select All"}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {catPerms.map(perm => (
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
                                className="w-4 h-4 accent-emerald-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{perm.name}</div>
                                <div className="text-[10px] text-theme-text-dim font-mono truncate">{perm.code}</div>
                              </div>
                              {perm.permission_type && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                  perm.permission_type === "menu" ? "bg-blue-500/20 text-blue-400" :
                                  perm.permission_type === "report" ? "bg-orange-500/20 text-orange-400" :
                                  perm.permission_type === "mobile" ? "bg-purple-500/20 text-purple-400" :
                                  "bg-gray-500/20 text-gray-400"
                                }`}>
                                  {perm.permission_type}
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB: USERS ==================== */}
      {tab === "users" && (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
          <div className="flex items-center justify-between">
            <div className="text-sm text-theme-text-dim">
              {userRoles.length} user{userRoles.length !== 1 ? "s" : ""} assigned
            </div>
            {!assignFormOpen && (
              <Button onClick={() => setAssignFormOpen(true)} variant="primary">+ Assign Role</Button>
            )}
          </div>

          {assignFormOpen && (
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle>Assign Role to User</CardTitle>
                <CardDescription>Map a role to a user by email.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Input
                    label="User Email"
                    value={assignEmail}
                    onChange={e => setAssignEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                      Role <span className="text-red-400">*</span>
                    </span>
                    <select
                      value={assignRoleId ?? ""}
                      onChange={e => setAssignRoleId(e.target.value ? Number(e.target.value) : null)}
                      className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text focus:border-emerald-500 outline-none transition"
                    >
                      <option value="">Select Role</option>
                      {roles.filter(r => r.is_active).map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Password (required for new users)"
                    type="password"
                    value={assignPassword}
                    onChange={e => setAssignPassword(e.target.value)}
                    placeholder="Min 12 chars"
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-theme-border">
                  <Button onClick={handleAssignRole} variant="accent" loading={assignSubmitting} loadingText="Assigning...">
                    Assign
                  </Button>
                  <Button onClick={() => { setAssignFormOpen(false); setAssignEmail(""); setAssignPassword(""); setAssignRoleId(null); }} variant="outline">
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="py-4">
              <div className="w-full">
                <CardTitle>User Role Assignments</CardTitle>
                <CardDescription>All users and their assigned roles.</CardDescription>
              </div>
              <Input
                placeholder="Search by email or role..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full sm:w-72"
              />
            </CardHeader>
            <CardContent className="p-0">
              <Table
                headers={["Email", "Role", "Actions"]}
                isLoading={usersLoading}
                emptyState="No user assignments"
              >
                {filteredUsers.map(u => (
                  <tr key={`${u.user_id}-${u.role_id}`} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-[13px] font-medium">{u.email}</td>
                    <td className="py-3 px-5 text-[13px]">
                      <span className="bg-theme-accent/10 text-emerald-400 text-[11px] font-bold px-2 py-0.5 rounded">
                        {u.role_name}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const newRoleId = prompt("Enter new role ID for this user:");
                          if (!newRoleId) return;
                          try {
                            await post("/api/rbac/users/assign-role", {
                              email: u.email,
                              role_id: Number(newRoleId),
                            });
                            toast.success("Role updated");
                            loadUserRoles();
                          } catch {
                            toast.error("Failed to update role");
                          }
                        }}
                      >
                        Change
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
