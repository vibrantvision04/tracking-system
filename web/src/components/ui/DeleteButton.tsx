"use client";
import React, { useState } from 'react';

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
  const [deleting, setDeleting] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(confirmMessage)) return;

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
        {deleting ? "Wiping..." : "🗑️ Delete"}
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
        "🗑️"
      )}
    </button>
  );
}
