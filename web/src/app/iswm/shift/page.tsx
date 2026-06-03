"use client";
import React, { useState, useEffect } from 'react';
import { api, post, del } from '@/lib/api';
import { z } from "zod";

import PageHeader from '@/components/shared/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import DeleteButton from '@/components/ui/DeleteButton';
import Table from '@/components/shared/Table';

type Shift = {
  id: number;
  shift_name: string;
  start_time: string;
  end_time: string;
  time_duration: number;
};

const shiftSchema = z.object({
  shift_name: z.string().trim().min(1, "Shift Name is required").max(100, "Shift Name cannot exceed 100 characters"),
  start_time: z.string().min(1, "Start Time is required"),
  end_time: z.string().min(1, "End Time is required"),
  time_duration: z.number().int().min(1, "Duration must be at least 1 hour").max(24, "Duration cannot exceed 24 hours")
});

export default function ShiftManager() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [form, setForm] = useState({
    shift_name: "",
    start_time: "",
    end_time: "",
    time_duration: 8
  });

  const loadShifts = async () => {
    setTableLoading(true);
    try {
      const res: any = await api('/api/shifts');
      if (res.success && res.data) {
        setShifts(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setErrors({});

    const result = shiftSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        const path = issue.path[0] as string;
        fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    // Ensure seconds are included in time for postgres time format
    let st = form.start_time;
    let et = form.end_time;
    if (st.split(":").length === 2) st += ":00";
    if (et.split(":").length === 2) et += ":00";

    try {
      const res: any = await post('/api/shifts', {
        shift_name: form.shift_name,
        start_time: st,
        end_time: et,
        time_duration: Number(form.time_duration) * 60
      });
      if (res.success) {
        setMessage("Shift created successfully!");
        setForm({ shift_name: "", start_time: "", end_time: "", time_duration: 8 });
        loadShifts();
      } else {
        setMessage(res.error || "Failed to create shift");
      }
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res: any = await del(`/api/shifts/${id}`);
      if (res.success) {
        loadShifts();
      } else {
        alert(res.error || "Failed to delete shift");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 bg-theme-base min-h-screen text-theme-text space-y-6">
      <PageHeader
        title="Shift Manager"
        description="Create and manage operational schedules, timing windows, and working shifts."
        breadcrumbs={[
          { label: "ISWM", href: "/iswm/shift" },
          { label: "Shift Manager" }
        ]}
      />

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col - Create Form */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create New Shift</CardTitle>
              <CardDescription>Setup a clean shift configuration block with exact hour boundaries.</CardDescription>
            </CardHeader>
            
            <CardContent>
              {message && (
                <div className={`p-3 rounded-lg mb-4 text-xs font-medium border ${
                  message.includes("success") 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}>
                  {message}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Shift Name"
                  placeholder="e.g. Morning Shift"
                  required
                  value={form.shift_name}
                  onChange={e => setForm({...form, shift_name: e.target.value})}
                  error={errors.shift_name}
                />

                <Input
                  label="Start Time"
                  type="time"
                  required
                  value={form.start_time}
                  onChange={e => setForm({...form, start_time: e.target.value})}
                  error={errors.start_time}
                />

                <Input
                  label="End Time"
                  type="time"
                  required
                  value={form.end_time}
                  onChange={e => setForm({...form, end_time: e.target.value})}
                  error={errors.end_time}
                />

                <Input
                  label="Duration (Hours)"
                  type="number"
                  required
                  min="1"
                  max="24"
                  value={form.time_duration}
                  onChange={e => setForm({...form, time_duration: Number(e.target.value)})}
                  error={errors.time_duration}
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="accent"
                    loading={loading}
                    loadingText="Creating..."
                    className="w-full"
                  >
                    Create Shift
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Col - List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Existing Shifts</CardTitle>
              <CardDescription>View, manage, and remove shifts. Changes update vehicles and routes immediately.</CardDescription>
            </CardHeader>
            
            <CardContent className="p-0">
              <Table
                headers={[
                  "ID",
                  "Name",
                  "Start",
                  "End",
                  <div key="dur" className="text-center">Duration</div>,
                  <div key="act" className="text-center">Action</div>
                ]}
                isLoading={tableLoading}
              >
                {shifts.map((s) => (
                  <tr key={s.id} className="hover:bg-theme-base/40 transition-colors">
                    <td className="px-5 py-3.5 text-theme-text-dim font-mono">{s.id}</td>
                    <td className="px-5 py-3.5 font-semibold text-theme-text">{s.shift_name}</td>
                    <td className="px-5 py-3.5 font-medium">{s.start_time}</td>
                    <td className="px-5 py-3.5 font-medium">{s.end_time}</td>
                    <td className="px-5 py-3.5 text-center font-bold text-theme-accent">
                      {(s.time_duration / 60).toFixed(1).replace(".0", "")} hr
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <DeleteButton
                        onDelete={() => handleDelete(s.id)}
                        confirmMessage={`Are you sure you want to delete shift "${s.shift_name}"?`}
                        className="mx-auto"
                      />
                    </td>
                  </tr>
                ))}
              </Table>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
