"use client";

import React, { useState, useEffect } from "react";
import { api, post, put, del } from "@/lib/api";
import Link from "next/link";

interface RegionType {
  id: number;
  title: string;
  parent_id: number | null;
  parent_title: string;
  is_active: boolean;
}

export default function RegionTypeManager() {
  const [types, setTypes] = useState<RegionType[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<RegionType | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  const [form, setForm] = useState({
    title: "",
    parent_id: "" as string | number,
  });

  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadRegionTypes = async () => {
    try {
      const res: any = await api("/api/region-types");
      if (res.success && res.data) {
        setTypes(res.data);
      }
    } catch (err) {
      console.error("Failed to load region types", err);
    }
  };

  useEffect(() => {
    loadRegionTypes();
  }, []);

  const handleAddClick = () => {
    setEditingType(null);
    setForm({ title: "", parent_id: "" });
    setFormOpen(true);
    setMessage(null);
  };

  const handleEditClick = (rt: RegionType) => {
    setEditingType(rt);
    setForm({
      title: rt.title,
      parent_id: rt.parent_id !== null ? rt.parent_id : "",
    });
    setFormOpen(true);
    setMessage(null);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingType(null);
    setForm({ title: "", parent_id: "" });
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const parentVal = form.parent_id === "" ? null : Number(form.parent_id);

    try {
      if (editingType) {
        // Update existing region type
        const res: any = await put(`/api/region-types/${editingType.id}`, {
          title: form.title,
          parent_id: parentVal,
        });

        if (res.success) {
          setMessage({ text: "Region type updated successfully!", type: "success" });
          setTimeout(() => handleCloseForm(), 1500);
          loadRegionTypes();
        } else {
          setMessage({ text: res.error || "Failed to update region type", type: "error" });
        }
      } else {
        // Create new region type
        const res: any = await post("/api/region-types", {
          title: form.title,
          parent_id: parentVal,
        });

        if (res.success) {
          setMessage({ text: "Region type created successfully!", type: "success" });
          setForm({ title: "", parent_id: "" });
          setTimeout(() => setFormOpen(false), 1500);
          loadRegionTypes();
        } else {
          setMessage({ text: res.error || "Failed to create region type", type: "error" });
        }
      }
    } catch (err: any) {
      setMessage({ text: err.message || "An error occurred", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this region type?")) return;
    try {
      const res: any = await del(`/api/region-types/${id}`);
      if (res.success) {
        loadRegionTypes();
      } else {
        alert(res.error || "Failed to delete region type");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f4f6fa] text-slate-800 overflow-hidden select-none">
      {/* Premium light-grey header bar */}
      <header className="h-16 bg-white px-6 flex items-center justify-between border-b border-slate-200 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-[13px] shadow-md shadow-emerald-500/20 shrink-0">
            JN
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-slate-800 tracking-tight leading-none uppercase">
              ISWM - Nagar Nigam Jaipur
            </h1>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              Integrated Solid Waste Management System
            </span>
          </div>
        </div>

 
      </header>

      {/* Main scrolling content area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Section Header */}
          <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Region Type</h2>
              <div className="h-1 bg-emerald-600 w-10 mt-1.5 rounded-full" />
            </div>
            
            <button
              onClick={handleAddClick}
              disabled={formOpen && !editingType}
              className="bg-[#e4e8f0] hover:bg-[#d8dce6] text-slate-700 font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm disabled:opacity-50"
            >
              Add Region Type
            </button>
          </div>

          {/* Create/Edit Form Container */}
          {formOpen && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm transition-all duration-300">
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4">
                {editingType ? "Edit Region Type" : "Create New Region Type"}
              </h3>

              {message && (
                <div
                  className={`p-3 rounded-lg mb-4 text-xs font-bold ${
                    message.type === "success"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      : "bg-red-50 text-red-600 border border-red-100"
                  }`}
                >
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Region Type Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      Region Type<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Eg. City"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 outline-none transition-all font-semibold"
                    />
                  </div>

                  {/* Parent Type Select Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      Parent Type <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <select
                      value={form.parent_id}
                      onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all font-semibold cursor-pointer"
                    >
                      <option value="">Select Parent Type</option>
                      {types
                        .filter((t) => !editingType || t.id !== editingType.id) // Prevent self-parenting
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition-all shadow-md shadow-emerald-600/10 disabled:opacity-50"
                  >
                    {loading ? "Submitting..." : "Submit"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseForm}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-5 py-2.5 rounded-lg transition-all"
                  >
                    Close
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List Table Card Container */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 uppercase font-black tracking-wider">
                    <th className="py-3.5 px-6 w-20">S. No.</th>
                    <th className="py-3.5 px-6">Region Type</th>
                    <th className="py-3.5 px-6">Parent Type</th>
                    <th className="py-3.5 px-6 w-32 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {types.map((rt, index) => (
                    <tr key={rt.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-6 font-mono text-slate-400">{index + 1}</td>
                      <td className="py-3.5 px-6 text-slate-800 font-bold">{rt.title}</td>
                      <td className="py-3.5 px-6 text-slate-500">
                        {rt.parent_title || <span className="text-slate-300 font-medium">—</span>}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleEditClick(rt)}
                            className="p-1.5 border border-slate-200 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-all"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(rt.id)}
                            className="p-1.5 border border-slate-200 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-all"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {types.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-10 text-slate-400 font-medium">
                        No region types configured.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Total row matching screenshot */}
            <div className="bg-slate-100 border-t border-slate-200 px-6 py-2.5 text-slate-500 text-xs font-bold">
              {types.length} total
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
