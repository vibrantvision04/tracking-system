"use client";

import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { toast } from "react-toastify";
import dynamic from "next/dynamic";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

const CleaningMap = dynamic(() => import("@/components/CleaningMap"), { ssr: false });

interface OpenDepot {
  id: number;
  name: string;
  zone_id: number;
  ward_id: number;
  latitude: number;
  longitude: number;
  radius: number;
  status: string;
}

interface CleaningSubmission {
  id: number;
  open_depot_id: number;
  image_url: string;
  uploaded_by: string;
  uploaded_latitude: number;
  uploaded_longitude: number;
  upload_time: string;
  verification_status: string;
  approval_status: string;
  jhalli_patti_used: boolean | null;
  approved_by: string | null;
  approved_time: string | null;
  remarks: string | null;
  distance_from_depot: number;
  open_depot_name?: string;
  zone_name?: string;
  ward_name?: string;
}

export default function OpenDepotCleaningPage() {
  const [depots, setDepots] = useState<OpenDepot[]>([]);
  const [submissions, setSubmissions] = useState<CleaningSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");

  // Modal review state
  const [reviewItem, setReviewItem] = useState<CleaningSubmission | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [activeReviewAction, setActiveReviewAction] = useState<"approve" | "reject" | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const depotsRes = await api<{ data: OpenDepot[] }>("/api/open-depots");
      setDepots((depotsRes.data || []).filter(d => d.status === "Active"));

      const subRes = await api<{ data: CleaningSubmission[] }>("/api/open-depots/cleanings?approval_status=Pending");
      setSubmissions(subRes.data || []);
    } catch (err) {
      toast.error("Failed to load cleaning verification data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdminReview = async (status: "Approved" | "Rejected", jhalliPattiUsed?: boolean) => {
    if (!reviewItem) return;

    setReviewLoading(true);
    try {
      const payload = {
        approval_status: status,
        jhalli_patti_used: jhalliPattiUsed,
        remarks: status === "Rejected" ? rejectRemarks : "",
        approved_by: "Admin User",
      };

      await post(`/api/open-depots/cleanings/${reviewItem.id}/review`, payload);
      toast.success(`Submission ${status.toLowerCase()} successfully.`);
      
      setReviewItem(null);
      setRejectRemarks("");
      setActiveReviewAction(null);
      
      // Reload submissions list
      const subRes = await api<{ data: CleaningSubmission[] }>("/api/open-depots/cleanings?approval_status=Pending");
      setSubmissions(subRes.data || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit admin review decision.");
    } finally {
      setReviewLoading(false);
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    return (s.open_depot_name || "")
      .toLowerCase()
      .includes(searchQuery.toLowerCase()) || 
      s.uploaded_by.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const activeDepot = reviewItem
    ? depots.find(d => d.id === reviewItem.open_depot_id)
    : null;

  return (
    <div className="min-h-screen bg-theme-base p-4 md:p-6 text-theme-text">
      <PageHeader 
        title="Open Depot Cleaning Reviews" 
        description="Manage and audit cleaning verification reports submitted by field workers" 
      />

      {/* Filter and Stats Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 mt-4">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1 max-w-sm">
          <Input
            type="text"
            placeholder="Search by depot name or worker..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-theme-surface border border-theme-border text-theme-text text-xs p-2.5 rounded-xl focus:border-emerald-500"
          />
        </div>

        {/* Counts summary badge */}
        <div className="flex gap-2">
          <span className="bg-amber-500/10 text-amber-500 text-xs px-3 py-1.5 rounded-xl border border-amber-500/20 font-bold animate-pulse">
            {submissions.length} Pending Reviews
          </span>
        </div>
      </div>

      {/* Professional List Table */}
      <Card className="border border-theme-border bg-theme-surface shadow-sm overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center text-theme-text-dim font-bold text-xs">
              Fetching submitted cleaning records...
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="py-20 text-center text-theme-text-dim">
              <span className="text-3xl block mb-2">📋</span>
              <span className="text-xs font-bold block">No submissions found matching criteria.</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-theme-base/60 border-b border-theme-border font-bold text-theme-text text-[11px] uppercase tracking-wider">
                  <th className="p-4 w-16">Photo</th>
                  <th className="p-4">Open Depot</th>
                  <th className="p-4">Uploaded By</th>
                  <th className="p-4">Upload Time</th>
                  <th className="p-4">Geofence Audit</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border">
                {filteredSubmissions.map((s) => (
                  <tr key={s.id} className="hover:bg-theme-base/40 transition duration-150">
                    <td className="p-4">
                      <img
                        src={s.image_url}
                        alt="Thumbnail"
                        className="w-12 h-12 rounded-lg object-cover border border-theme-border shadow-sm cursor-pointer hover:scale-105 transition"
                        onClick={() => setReviewItem(s)}
                      />
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-theme-text block">{s.open_depot_name || `Depot #${s.open_depot_id}`}</span>
                      <span className="text-[10px] text-theme-text-dim block mt-0.5">
                        {s.zone_name} • {s.ward_name}
                      </span>
                    </td>
                    <td className="p-4 font-semibold">{s.uploaded_by}</td>
                    <td className="p-4 text-theme-text-dim">
                      {new Date(s.upload_time).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                        s.verification_status === "VALID"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-rose-500/10 text-rose-400"
                      }`}>
                        {s.verification_status === "VALID" ? "✓ VALID" : "⚠️ OUTSIDE"}
                      </span>
                      <span className="block text-[10px] text-theme-text-dim mt-1">
                        Distance: {s.distance_from_depot.toFixed(1)} meters
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                        s.approval_status === "Approved"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : s.approval_status === "Rejected"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}>
                        {s.approval_status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {s.approval_status === "Pending" ? (
                        <Button
                          onClick={() => {
                            setReviewItem(s);
                            setActiveReviewAction(null);
                          }}
                          variant="accent"
                          className="text-xs px-3.5 py-1.5"
                        >
                          Review
                        </Button>
                      ) : (
                        <Button
                          onClick={() => {
                            setReviewItem(s);
                            setActiveReviewAction(null);
                          }}
                          variant="outline"
                          className="text-xs px-3.5 py-1.5"
                        >
                          View Details
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* PROFESSIONAL AUDIT MODAL */}
      {reviewItem && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-theme-surface border border-theme-border max-w-4xl w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
            {/* Modal Header */}
            <div className="p-4 border-b border-theme-border flex items-center justify-between bg-theme-base/40">
              <div>
                <h3 className="text-sm font-bold text-theme-text flex items-center gap-2">
                  <span>Audit Cleaning: {reviewItem.open_depot_name || `Depot #${reviewItem.open_depot_id}`}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                    reviewItem.verification_status === "VALID" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                  }`}>
                    {reviewItem.verification_status === "VALID" ? "VALID LOCATION" : "OUTSIDE RADIUS"}
                  </span>
                </h3>
                <span className="text-[10px] text-theme-text-dim block mt-0.5">
                  Submission ID: #{reviewItem.id} • Submitted by {reviewItem.uploaded_by} on {new Date(reviewItem.upload_time).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setReviewItem(null)}
                className="text-theme-text-dim hover:text-theme-text text-xs font-bold p-1 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 max-h-[70vh]">
              {/* Media grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Photo container */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-theme-text-dim tracking-wider uppercase block">Submitted Photo</span>
                  <div className="border border-theme-border rounded-xl overflow-hidden aspect-video bg-black flex items-center justify-center relative shadow-inner">
                    <img src={reviewItem.image_url} alt="Cleaning Proof" className="w-full h-full object-contain" />
                    <a
                      href={reviewItem.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute bottom-2 right-2 bg-theme-surface/90 backdrop-blur px-2.5 py-1 rounded text-[9px] font-bold text-theme-text hover:bg-theme-surface transition shadow"
                    >
                      🔍 View original
                    </a>
                  </div>
                </div>

                {/* Map container */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-theme-text-dim tracking-wider uppercase block">Geofence Compliance Map</span>
                  <div className="h-[210px] rounded-xl overflow-hidden relative shadow-inner">
                    {activeDepot && (
                      <CleaningMap
                        depotLat={activeDepot.latitude}
                        depotLng={activeDepot.longitude}
                        radius={activeDepot.radius}
                        uploadLat={reviewItem.uploaded_latitude}
                        uploadLng={reviewItem.uploaded_longitude}
                        verificationStatus={reviewItem.verification_status}
                        depotName={activeDepot.name}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Data list */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-theme-base/60 p-4 rounded-xl border border-theme-border text-xs">
                <div>
                  <span className="text-theme-text-dim block">Depot Coordinates:</span>
                  <span className="font-semibold text-theme-text">
                    {activeDepot?.latitude.toFixed(6)}, {activeDepot?.longitude.toFixed(6)}
                  </span>
                </div>
                <div>
                  <span className="text-theme-text-dim block">Worker Coordinates:</span>
                  <span className="font-semibold text-theme-text">
                    {reviewItem.uploaded_latitude.toFixed(6)}, {reviewItem.uploaded_longitude.toFixed(6)}
                  </span>
                </div>
                <div>
                  <span className="text-theme-text-dim block">Depot Radius:</span>
                  <span className="font-semibold text-emerald-400">{activeDepot?.radius} meters</span>
                </div>
                <div>
                  <span className="text-theme-text-dim block">Computed Distance:</span>
                  <span className={`font-semibold ${
                    reviewItem.verification_status === "VALID" ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    {reviewItem.distance_from_depot.toFixed(2)} meters
                  </span>
                </div>
              </div>

              {/* Status details for reviewed items */}
              {reviewItem.approval_status !== "Pending" && (
                <div className="bg-theme-base p-4 rounded-xl border border-theme-border text-xs space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold">Audit Result:</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      reviewItem.approval_status === "Approved" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    }`}>
                      {reviewItem.approval_status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-theme-text-dim mt-1">
                    <div>Reviewed by: <strong className="text-theme-text">{reviewItem.approved_by || "Admin"}</strong></div>
                    {reviewItem.approved_time && (
                      <div>Reviewed on: <strong className="text-theme-text">{new Date(reviewItem.approved_time).toLocaleString()}</strong></div>
                    )}
                    {reviewItem.jhalli_patti_used !== null && (
                      <div>Jhilli Patti Cleaned: <strong className="text-theme-text">{reviewItem.jhalli_patti_used ? "Yes" : "No"}</strong></div>
                    )}
                  </div>
                  {reviewItem.remarks && (
                    <div className="border-t border-theme-border/50 pt-2 text-rose-400 italic font-semibold">
                      Remarks: "{reviewItem.remarks}"
                    </div>
                  )}
                </div>
              )}
 
              {/* Review decisions (for pending items) */}
              {reviewItem.approval_status === "Pending" && (
                <div className="border-t border-theme-border/50 pt-4 space-y-4">
                  <span className="text-[10px] font-bold text-theme-text-dim tracking-wider uppercase block">Review Operations</span>
 
                  {!activeReviewAction ? (
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setActiveReviewAction("approve")}
                        variant="accent"
                        className="flex-1 py-3 text-xs font-bold"
                      >
                        ✓ Approve Submission
                      </Button>
                      <Button
                        onClick={() => setActiveReviewAction("reject")}
                        variant="danger"
                        className="flex-1 py-3 text-xs font-bold"
                      >
                        ✕ Reject Submission
                      </Button>
                    </div>
                  ) : activeReviewAction === "approve" ? (
                    <div className="bg-theme-base p-4 rounded-xl border border-theme-border space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold">Jhilli Patti Cleaned?</span>
                        <button
                          onClick={() => setActiveReviewAction(null)}
                          className="text-[10px] text-theme-text-dim hover:text-theme-text cursor-pointer"
                        >
                          ← Change Action
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          onClick={() => handleAdminReview("Approved", true)}
                          disabled={reviewLoading}
                          variant="accent"
                          className="py-3 text-xs font-bold"
                        >
                          Yes
                        </Button>
                        <Button
                          onClick={() => handleAdminReview("Approved", false)}
                          disabled={reviewLoading}
                          variant="primary"
                          className="py-3 text-xs font-bold"
                        >
                          No
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-theme-base p-4 rounded-xl border border-theme-border space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-rose-400">Rejection Reason *</span>
                        <button
                          onClick={() => setActiveReviewAction(null)}
                          className="text-[10px] text-theme-text-dim hover:text-theme-text cursor-pointer"
                        >
                          ← Change Action
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={rejectRemarks}
                        onChange={(e) => setRejectRemarks(e.target.value)}
                        placeholder="Explain why this cleaning proof is being rejected..."
                        className="w-full bg-theme-surface border border-theme-border text-theme-text text-xs p-3 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={() => handleAdminReview("Rejected")}
                          disabled={reviewLoading || !rejectRemarks.trim()}
                          variant="danger"
                          className="py-2 px-5 text-xs font-bold"
                        >
                          Confirm Rejection
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-theme-border bg-theme-base/40 flex justify-end">
              <Button
                onClick={() => setReviewItem(null)}
                variant="secondary"
                className="py-2 px-5 text-xs font-bold"
              >
                Close Audit Screen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
