"use client";
import React, { useState, useEffect } from 'react';
import { api, post, del } from '@/lib/api';
import { toast } from 'react-toastify';
import Table from '@/components/shared/Table';
import EditButton from '@/components/ui/EditButton';
import DeleteButton from '@/components/ui/DeleteButton';

interface Vehicle {
  id: number;
  registration_no: string;
}

interface Route {
  id: number;
  route_name: string;
  ward_id?: number;
  shift_id?: number;
}

interface Shift {
  id: number;
  shift_name: string;
}

interface Ward {
  id: number;
  region_name: string;
  parent_id: number;
}

interface AssignmentDetail {
  id: number;
  vehicle_id: number;
  vehicle_reg_no: string;
  route_id: number;
  route_name: string;
  shift_id: number;
  shift_name: string;
  assigned_date: string;
  is_active: boolean;
  ward_id?: number;
  ward_name?: string;
}

export default function RouteShiftVehicle() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);

  const [selectedWard, setSelectedWard] = useState("");
  const [selectedShift, setSelectedShift] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState("");

  const [searchFilter, setSearchFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);



  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [vehiclesRes, routesRes, shiftsRes, wardsRes] = await Promise.all([
        api<{ success: boolean; data: Vehicle[] }>('/api/vehicles'),
        api<{ success: boolean; data: Route[] }>('/api/routes'),
        api<{ success: boolean; data: Shift[] }>('/api/shifts?group=VEHICLE_MOVEMENT'),
        api<{ success: boolean; data: Ward[] }>('/api/wards'),
      ]);

      if (vehiclesRes.success) setVehicles(vehiclesRes.data || []);
      if (routesRes.success) setRoutes(routesRes.data || []);
      if (shiftsRes.success) setShifts(shiftsRes.data || []);
      if (wardsRes.success) setWards(wardsRes.data || []);
    } catch (err) {
      toast.error("Failed to load dropdown options.");
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async () => {
    try {
      const res = await api<{ success: boolean; data: AssignmentDetail[] }>('/api/vehicle-route-assignments');
      if (res.success) {
        setAssignments(res.data || []);
      }
    } catch (err) {
      toast.error("Failed to load current assignments.");
    }
  };

  useEffect(() => {
    loadInitialData();
    loadAssignments();
  }, []);

  // Filter routes based on selected Ward and Shift in the form, and exclude already assigned routes on the selected date
  const getFilteredRoutesForDropdown = () => {
    return routes.filter(r => {
      if (selectedWard && r.ward_id !== parseInt(selectedWard)) {
        return false;
      }
      if (selectedShift && r.shift_id !== parseInt(selectedShift)) {
        return false;
      }
      // Dropdown Filter: One route of one shift can be assigned to only one vehicle.
      if (selectedShift) {
        const isAssigned = assignments.some(a => 
          String(a.shift_id) === selectedShift && 
          a.route_id === r.id && 
          a.id !== editingId
        );
        if (isAssigned) return false;
      }
      return true;
    });
  };

  // Filter vehicles based on selected Shift, excluding already assigned vehicles
  const getFilteredVehiclesForDropdown = () => {
    return vehicles.filter(v => {
      if (selectedShift) {
        const isAssigned = assignments.some(a => 
          String(a.shift_id) === selectedShift && 
          a.vehicle_id === v.id && 
          a.id !== editingId
        );
        if (isAssigned) return false;
      }
      return true;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (!selectedVehicle || !selectedRoute || !selectedShift) {
      toast.warning("Please select vehicle, shift, and route.");
      setSubmitting(false);
      return;
    }

    try {
      // If editing and vehicle/shift changed, delete the old assignment first to avoid unique key violation
      if (editingId) {
        const original = assignments.find(a => a.id === editingId);
        if (original && (String(original.vehicle_id) !== selectedVehicle || String(original.shift_id) !== selectedShift)) {
          await del(`/api/vehicle-route-assignments/${editingId}`);
        }
      }

      const res: any = await post(`/api/vehicles/${selectedVehicle}/assign-route`, {
        route_id: parseInt(selectedRoute),
        shift_id: parseInt(selectedShift),
        date: new Date().toLocaleDateString('en-CA'),
      });

      if (res.success) {
        toast.success(editingId ? "Assignment updated successfully." : "Route assigned successfully.");
        setIsFormOpen(false);
        setEditingId(null);
        // Reset selections
        setSelectedWard("");
        setSelectedShift("");
        setSelectedRoute("");
        setSelectedVehicle("");
        loadAssignments();
      } else {
        toast.error(res.error || "Failed to assign route.");
      }
    } catch (err: any) {
      toast.error("Error assigning route: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditForm = (assignment: AssignmentDetail) => {
    // Attempt to locate ward ID from matching route
    const route = routes.find(r => r.id === assignment.route_id);
    setEditingId(assignment.id);
    setSelectedWard(route?.ward_id ? String(route.ward_id) : "");
    setSelectedShift(String(assignment.shift_id));
    setSelectedRoute(String(assignment.route_id));
    setSelectedVehicle(String(assignment.vehicle_id));
    setIsFormOpen(true);
  };

  const handleDeleteAssignment = async (id: number) => {
    try {
      const res = await del<{ success: boolean }>(`/api/vehicle-route-assignments/${id}`);
      if (res.success) {
        toast.success("Assignment deleted successfully.");
        loadAssignments();
      }
    } catch (err) {
      toast.error("Failed to delete assignment.");
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setSelectedWard("");
    setSelectedShift("");
    setSelectedRoute("");
    setSelectedVehicle("");
  };

  // Client-side table filtering
  const filteredAssignments = assignments.filter(a => {
    const term = searchFilter.toLowerCase();
    return (
      a.route_name.toLowerCase().includes(term) ||
      a.vehicle_reg_no.toLowerCase().includes(term) ||
      a.shift_name.toLowerCase().includes(term)
    );
  });



  return (
    <div className="flex-1 flex flex-col h-full bg-[#f4f6f9] text-gray-800 overflow-hidden font-sans p-6 lg:p-8 space-y-6">
      
      {/* Premium Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">Route To Vehicle & Shift</h1>
          <div className="w-8 h-1 bg-emerald-500 rounded-full"></div>
        </div>
        <button 
          onClick={() => {
            if (isFormOpen) {
              handleCloseForm();
            } else {
              setIsFormOpen(true);
            }
          }}
          className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition shadow-sm bg-white"
        >
          Assign Route To Vehicle & Shift
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-6">
        
        {/* Assignment Form Card */}
        {isFormOpen && (
          <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6 space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                {editingId ? "✏️ Edit Route Assignment" : "📋 Create Route Assignment"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                
                {/* Region / Ward Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600">Region<span className="text-rose-500">*</span></label>
                  <select 
                    value={selectedWard}
                    onChange={e => {
                      setSelectedWard(e.target.value);
                      setSelectedRoute(""); // Reset route when ward changes
                    }}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-xs text-gray-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition cursor-pointer"
                  >
                    <option value="">Select Ward</option>
                    {wards.map(w => (
                      <option key={w.id} value={w.id}>{w.region_name}</option>
                    ))}
                  </select>
                </div>

                {/* Shift Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600">Shift<span className="text-rose-500">*</span></label>
                  <select 
                    value={selectedShift}
                    onChange={e => {
                      setSelectedShift(e.target.value);
                      setSelectedRoute(""); // Reset route when shift changes
                    }}
                    required
                    className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-xs text-gray-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition cursor-pointer"
                  >
                    <option value="">Select Shift</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>{s.shift_name}</option>
                    ))}
                  </select>
                </div>

                {/* Route Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600">Route<span className="text-rose-500">*</span></label>
                  <select 
                    value={selectedRoute}
                    onChange={e => setSelectedRoute(e.target.value)}
                    required
                    className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-xs text-gray-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition cursor-pointer"
                  >
                    <option value="">Select Route</option>
                    {getFilteredRoutesForDropdown().map(r => (
                      <option key={r.id} value={r.id}>{r.route_name}</option>
                    ))}
                  </select>
                </div>

                {/* Vehicle Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600">Vehicle<span className="text-rose-500">*</span></label>
                  <select 
                    value={selectedVehicle}
                    onChange={e => setSelectedVehicle(e.target.value)}
                    required
                    className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-xs text-gray-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition cursor-pointer"
                  >
                    <option value="">Select Vehicle</option>
                    {getFilteredVehiclesForDropdown().map(v => (
                      <option key={v.id} value={v.id}>{v.registration_no}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Form Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
                <button 
                  type="button" 
                  onClick={handleCloseForm}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Assignments Table Card */}
        <div className="bg-white rounded-xl border border-gray-150 shadow-sm flex flex-col overflow-hidden p-0">
          
          {/* Table Header Filter Search */}
          <div className="p-5 flex justify-end items-center bg-white border-b border-gray-100">
            <input 
              type="text" 
              placeholder="Filter..." 
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-64 bg-white border border-gray-200 rounded-lg px-3.5 py-2 text-xs text-gray-700 outline-none focus:border-emerald-500 transition shadow-inner"
            />
          </div>

          {/* Table */}
          <Table
            headers={[
              <div key="s" className="text-center w-20 text-gray-500 font-extrabold uppercase text-[10px] tracking-wider">S. NO.</div>,
              <span key="route" className="text-gray-500 font-extrabold uppercase text-[10px] tracking-wider">Route</span>,
              <span key="shift" className="text-gray-500 font-extrabold uppercase text-[10px] tracking-wider w-48 block">Shift</span>,
              <span key="veh" className="text-gray-500 font-extrabold uppercase text-[10px] tracking-wider w-64 block">Vehicle</span>,
              <div key="action" className="text-center w-32 text-gray-500 font-extrabold uppercase text-[10px] tracking-wider">Action</div>,
            ]}
            isLoading={loading}
            itemsPerPage={20}
            emptyState={
              <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-slate-400">
                <span className="text-3xl">📭</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider">No assignments found</span>
                <span className="text-[10px]">Try adjusting your filters or adding a new assignment.</span>
              </div>
            }
          >
            {filteredAssignments.map((item, idx) => (
              <tr key={`${item.id}-${idx}`} className="hover:bg-gray-50/50 transition-colors border-b border-theme-border">
                <td className="py-4 px-6 text-center text-gray-400 font-mono text-[11px]">
                  {idx + 1}
                </td>
                <td className="py-4 px-6 text-gray-900 font-semibold">{item.route_name}</td>
                <td className="py-4 px-6 text-gray-600">{item.shift_name}</td>
                <td className="py-4 px-6 text-gray-600 font-semibold">{item.vehicle_reg_no}</td>
                <td className="py-4 px-6 text-center">
                  <div className="flex items-center justify-center gap-3">
                    <EditButton onClick={() => handleOpenEditForm(item)} title="Edit Assignment" />
                    <DeleteButton
                      onDelete={() => handleDeleteAssignment(item.id)}
                      confirmMessage={`Delete assignment for vehicle ${item.vehicle_reg_no} in ${item.shift_name}?`}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </div>
  );
}
