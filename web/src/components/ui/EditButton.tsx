"use client";
import React from 'react';

interface EditButtonProps {
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  variant?: 'icon' | 'outline' | 'primary';
  title?: string;
}

export default function EditButton({
  onClick,
  className = "",
  variant = 'icon',
  title = "Edit Record"
}: EditButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(e);
  };

  const baseStyles = "transition-all duration-200 select-none flex items-center justify-center cursor-pointer";

  if (variant === 'primary') {
    return (
      <button
        onClick={handleClick}
        className={`${baseStyles} bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow shadow-indigo-600/10 ${className}`}
        title={title}
      >
        ✏️ Edit
      </button>
    );
  }

  if (variant === 'outline') {
    return (
      <button
        onClick={handleClick}
        className={`${baseStyles} border border-theme-border text-theme-text hover:bg-theme-surface px-2.5 py-1.5 rounded-lg text-xs font-medium ${className}`}
        title={title}
      >
        Edit
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`${baseStyles} p-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-lg ${className}`}
      title={title}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  );
}
