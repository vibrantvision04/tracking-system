"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, del, put } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface UserAccount {
  id: number;
  email: string;
  role: string;
}

const DEFAULT_ROLES = [
  "City Administrator",
  "Operator",
  "CSI",
  "admin",
  "manager",
  "viewer"
];

export default function RoleUserPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  // Form states
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const [roleSearch, setRoleSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const [tableFilter, setTableFilter] = useState("");

  const roleRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: UserAccount[] }>("/api/users");
      // Filter out users that have empty role if needed, but since we manage roles here, we show all users in the table
      setUsers(res.data || []);
    } catch {
      toast.error("Failed to load user accounts.");
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
    setEditingUserId(null);
    setSelectedRole("");
    setUserEmail("");
    setRoleSearch("");
    setUserSearch("");
  };

  const handleEdit = (user: UserAccount) => {
    setIsEditing(true);
    setEditingUserId(user.id);
    setSelectedRole(user.role);
    setUserEmail(user.email);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const emailToSubmit = userEmail.trim();
    if (!selectedRole || !emailToSubmit) {
      toast.warning("Both Role and User (email) are required.");
      return;
    }

    if (!emailToSubmit.includes("@")) {
      toast.warning("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && editingUserId) {
        await put(`/api/users/${editingUserId}`, {
          email: emailToSubmit,
          role: selectedRole
        });
        toast.success("User role updated successfully!");
      } else {
        await post("/api/users", {
          email: emailToSubmit,
          role: selectedRole
        });
        toast.success("User role assigned successfully!");
      }
      closeForm();
      loadData();
    } catch {
      toast.error("Failed to save role assignment.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: UserAccount) => {
    try {
      await del(`/api/users/${user.id}`);
      toast.success("User deleted successfully!");
      loadData();
    } catch {
      toast.error("Failed to delete user.");
    }
  };

  const filteredUsersForTable = users.filter(u => {
    const search = tableFilter.toLowerCase();
    return (
      u.email?.toLowerCase().includes(search) ||
      u.role?.toLowerCase().includes(search)
    );
  });

  const filteredRoles = DEFAULT_ROLES.filter(r =>
    r.toLowerCase().includes(roleSearch.toLowerCase())
  );

  // Users for dropdown (unique emails already in db)
  const filteredDropdownUsers = users
    .map(u => u.email)
    .filter((email, index, self) => self.indexOf(email) === index)
    .filter(email => email.toLowerCase().includes(userSearch.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans p-6 lg:p-8">
      <PageHeader
        title="Role To User"
        description="Configure dynamic access controls by mapping administrative roles to registered user accounts."
        breadcrumbs={[{ label: "VSWM", href: "/vswm/shift" }, { label: "Role To User" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "Assign Role To User"}
          </Button>
        }
      />

      <div className="flex-1 overflow-hidden space-y-6">
        {formOpen && (
          <Card className="animate-fade-in relative z-20 !overflow-visible">
            <CardHeader>
              <CardTitle>{isEditing ? "Modify Role Assignment" : "Assign Role To User"}</CardTitle>
              <CardDescription>
                {isEditing 
                  ? "Update the email or role for this user mapping." 
                  : "Select an administrative role and select or type a user email to create an account assignment."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                {/* Role Searchable Dropdown */}
                <div className="flex flex-col relative" ref={roleRef}>
                  <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                    Role <span className="text-red-400">*</span>
                  </span>
                  <div
                    className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition"
                    onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                  >
                    <span className={selectedRole ? "text-theme-text font-medium" : "text-theme-text-dim"}>
                      {selectedRole || "Select Role"}
                    </span>
                    <span className="text-theme-text-dim text-xs">{roleDropdownOpen ? "▲" : "▼"}</span>
                  </div>
                  {roleDropdownOpen && (
                    <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
                      <div className="p-2 border-b border-theme-border">
                        <input
                          type="text"
                          placeholder="Search Role"
                          value={roleSearch}
                          onChange={e => setRoleSearch(e.target.value)}
                          className="w-full bg-transparent text-sm text-theme-text outline-none placeholder:text-theme-text-dim"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredRoles.length === 0 ? (
                          <div className="px-4 py-2.5 text-xs text-theme-text-dim italic">No roles found</div>
                        ) : (
                          filteredRoles.map(roleName => (
                            <div
                              key={roleName}
                              className={`px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition ${roleName === selectedRole ? "bg-theme-accent/10 text-emerald-400" : ""}`}
                              onClick={() => {
                                if (selectedRole === roleName) {
                                  setSelectedRole("");
                                } else {
                                  setSelectedRole(roleName);
                                }
                                setRoleDropdownOpen(false);
                                setRoleSearch("");
                              }}
                            >
                              {roleName}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* User Searchable Dropdown / input */}
                <div className="flex flex-col relative" ref={userRef}>
                  <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                    User <span className="text-red-400">*</span>
                  </span>
                  <div
                    className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition"
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  >
                    <span className={userEmail ? "text-theme-text font-medium truncate" : "text-theme-text-dim truncate"}>
                      {userEmail || "Select User"}
                    </span>
                    <span className="text-theme-text-dim text-xs flex-shrink-0 ml-2">{userDropdownOpen ? "▲" : "▼"}</span>
                  </div>
                  {userDropdownOpen && (
                    <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
                      <div className="p-2 border-b border-theme-border flex gap-2">
                        <input
                          type="text"
                          placeholder="Search or enter email"
                          value={userSearch}
                          onChange={e => {
                            setUserSearch(e.target.value);
                            setUserEmail(e.target.value); // Sync typed text as email
                          }}
                          className="w-full bg-transparent text-sm text-theme-text outline-none placeholder:text-theme-text-dim"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {/* If user search is an email and not in the list, allow creating it */}
                        {userSearch.includes("@") && !filteredDropdownUsers.includes(userSearch) && (
                          <div
                            className="px-4 py-2 text-xs text-theme-accent hover:bg-theme-accent/20 cursor-pointer font-bold border-b border-theme-border"
                            onClick={() => {
                              setUserEmail(userSearch);
                              setUserDropdownOpen(false);
                              setUserSearch("");
                            }}
                          >
                            ➕ Add new email: "{userSearch}"
                          </div>
                        )}
                        {filteredDropdownUsers.length === 0 ? (
                          <div className="px-4 py-2.5 text-xs text-theme-text-dim italic">
                            {userSearch.includes("@") ? "Click above to add email" : "No users found. Type an email address."}
                          </div>
                        ) : (
                          filteredDropdownUsers.map(email => (
                            <div
                              key={email}
                              className={`px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition ${email === userEmail ? "bg-theme-accent/10 text-emerald-400" : ""}`}
                              onClick={() => {
                                if (userEmail === email) {
                                  setUserEmail("");
                                } else {
                                  setUserEmail(email);
                                }
                                setUserDropdownOpen(false);
                                setUserSearch("");
                              }}
                            >
                              {email}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
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
              <CardTitle>Role To User Assignments</CardTitle>
              <CardDescription>All mappings configured between administrative roles and user accounts.</CardDescription>
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
                {users.length} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. NO.</div>,
                  "ROLE",
                  "USER",
                  <div key="a" className="text-right pr-4 w-32">ACTION</div>
                ]}
                isLoading={loading}
                emptyState="No data to display"
              >
                {filteredUsersForTable.map((u, idx) => (
                  <tr key={u.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-semibold text-theme-text text-[13px]">
                      {u.role}
                    </td>
                    <td className="py-3 px-5 text-theme-text-dim font-medium text-[13px]">
                      {u.email}
                    </td>
                    <td className="py-3 px-5 text-right flex items-center justify-end gap-2.5 h-[50px] pr-6">
                      <EditButton onClick={() => handleEdit(u)} />
                      <DeleteButton
                        onDelete={() => handleDelete(u)}
                        confirmMessage={`Remove role mapping and account for ${u.email}?`}
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
