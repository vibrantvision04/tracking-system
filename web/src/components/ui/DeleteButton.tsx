"use client";
import React, { useState } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

interface DeleteButtonProps {
  onDelete: () => Promise<void> | void;
  confirmMessage?: string;
  className?: string;
  variant?: 'icon' | 'danger-button' | 'outline';
}

export default function DeleteButton({
  onDelete,
  confirmMessage = "Are you sure you want to delete this record?",
  className = "",
  variant = 'icon'
}: DeleteButtonProps) {
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const isConfirmed = await confirm({
      title: "Delete Confirmation",
      message: confirmMessage,
      variant: "danger"
    });
    if (!isConfirmed) return;

    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(false);
    }
  };

  const baseStyles = "transition-all duration-200 disabled:opacity-50 select-none flex items-center justify-center";

  if (variant === 'danger-button') {
    return (
      <button
        onClick={handleClick}
        disabled={deleting}
        className={`${baseStyles} bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow shadow-red-600/10 ${className}`}
        title="Delete"
      >
        {deleting ? "Wiping..." : (
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            Delete
          </span>
        )}
      </button>
    );
  }

  if (variant === 'outline') {
    return (
      <button
        onClick={handleClick}
        disabled={deleting}
        className={`${baseStyles} border border-red-500/30 text-red-500 hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg text-xs font-medium ${className}`}
        title="Delete"
      >
        {deleting ? "Wiping..." : "Delete"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={deleting}
      className={`${baseStyles} p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg ${className}`}
      title="Delete"
    >
      {deleting ? (
        <span className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      )}
    </button>
  );
}
