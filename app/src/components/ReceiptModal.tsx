'use client';

import { useState } from 'react';
import { X, Lock, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
}

export default function ReceiptModal({ isOpen, onClose, data }: ReceiptModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#0B0D14] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-eclipse-green/10">
              <Lock className="w-4 h-4 text-eclipse-green" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Private State Receipt</h2>
              <p className="text-xs text-eclipse-text-muted">Decrypted from MagicBlock TEE</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/5 transition-colors text-eclipse-text-muted hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-black/40">
          <div className="flex items-center gap-2 mb-4 text-sm font-medium text-eclipse-text-muted">
            <Database className="w-4 h-4" />
            Raw JSON Output
          </div>
          <div className="bg-[#11131A] rounded-xl p-4 font-mono text-sm overflow-x-auto border border-white/5">
            <pre className="text-eclipse-green-light">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-end">
          <Button onClick={onClose} variant="default" className="border-white/10 text-white">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
