"use client";
import React, { useState, useEffect } from 'react';
import { api, post, del } from '@/lib/api';
import { toast } from 'react-toastify';

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

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [vehiclesRes, routesRes, shiftsRes, wardsRes] = await Promise.all([
        api<{ success: boolean; data: Vehicle[] }>('/api/vehicles'),
        api<{ success: boolean; data: Route[] }>('/api/routes'),
        api<{ success: boolean; data: Shift[] }>('/api/shifts'),
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

  // Pagination calculations
  const totalItems = filteredAssignments.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const currentData = filteredAssignments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

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
        <div className="bg-white rounded-xl border border-gray-150 shadow-sm flex flex-col overflow-hidden">
          
          {/* Table Header Filter Search */}
          <div className="p-5 flex justify-end items-center bg-white border-b border-gray-100">
            <input 
              type="text" 
              placeholder="Filter..." 
              value={searchFilter}
              onChange={e => {
                setSearchFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-64 bg-white border border-gray-200 rounded-lg px-3.5 py-2 text-xs text-gray-700 outline-none focus:border-emerald-500 transition shadow-inner"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-150 bg-gray-50/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider select-none">
                  <th className="px-6 py-4 font-semibold text-center w-20">S. NO.</th>
                  <th className="px-6 py-4 font-semibold">ROUTE</th>
                  <th className="px-6 py-4 font-semibold w-48">SHIFT</th>
                  <th className="px-6 py-4 font-semibold w-64">VEHICLE</th>
                  <th className="px-6 py-4 font-semibold text-center w-32">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <span className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                        <span className="text-[11px] font-bold tracking-wide uppercase">Loading assignments...</span>
                      </div>
                    </td>
                  </tr>
                ) : totalItems === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                        <span className="text-xl">📭</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider">No assignments found</span>
                        <span className="text-[10px] text-gray-400/80">Try adjusting your filters or adding a new assignment.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentData.map((item, idx) => (
                    <tr key={`${item.id}-${idx}`} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6 text-center text-gray-400 font-mono text-[11px]">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="py-4 px-6 text-gray-900 font-semibold">{item.route_name}</td>
                      <td className="py-4 px-6 text-gray-600">{item.shift_name}</td>
                      <td className="py-4 px-6 text-gray-600 font-semibold">{item.vehicle_reg_no}</td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-3">
                          
                          {/* Edit Action Button */}
                          <button 
                            onClick={() => handleOpenEditForm(item)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md transition duration-200 border border-transparent hover:border-blue-100"
                            title="Edit Assignment"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>

                          {/* Delete Action Button */}
                          <button 
                            onClick={() => {
                              if (confirm(`Delete assignment for vehicle ${item.vehicle_reg_no} in ${item.shift_name}?`)) {
                                handleDeleteAssignment(item.id);
                              }
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition duration-200 border border-transparent hover:border-red-100"
                            title="Delete Assignment"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>

                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Counts & Pagination */}
          {!loading && totalItems > 0 && (
            <div className="border-t border-gray-100 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50">
              
              {/* Total Entries Count */}
              <span className="text-xs text-gray-500 font-semibold">
                {totalItems} total
              </span>

              {/* Mock Pagination matching screenshot: |< < 1 2 3 4 5 > >| */}
              <div className="flex items-center gap-1 select-none">
                
                {/* First Page Button */}
                <button 
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-bold"
                  title="First Page"
                >
                  |&lt;
                </button>

                {/* Prev Page Button */}
                <button 
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-bold"
                  title="Previous Page"
                >
                  &lt;
                </button>

                {/* Page Number Buttons */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5) {
                    if (currentPage > 3) {
                      pageNum = currentPage - 2 + i;
                      if (currentPage + 2 > totalPages) {
                        pageNum = totalPages - (4 - i);
                      }
                    }
                  }
                  const active = currentPage === pageNum;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-7 h-7 flex items-center justify-center rounded-md border text-xs font-bold transition ${
                        active 
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" 
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                {/* Next Page Button */}
                <button 
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-bold"
                  title="Next Page"
                >
                  &gt;
                </button>

                {/* Last Page Button */}
                <button 
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-bold"
                  title="Last Page"
                >
                  &gt;|
                </button>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
