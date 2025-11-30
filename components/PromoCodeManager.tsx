import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Plus, Trash2, Loader2, Copy } from 'lucide-react';
import { 
  subscribeToPromoCodes, 
  addPromoCode, 
  deletePromoCode 
} from '../services/firebase';

interface PromoCode {
  id: string;
  createdAt: string;
}

export const PromoCodeManager: React.FC = () => {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [newCode, setNewCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToPromoCodes((codes) => {
      setPromoCodes(codes);
      setIsLoading(false);
    }, (err) => {
      setError('Failed to load promo codes. Check security rules.');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddCode = async () => {
    if (!newCode.trim()) {
      setError('Promo code cannot be empty.');
      return;
    }
    setIsAdding(true);
    setError('');
    try {
      await addPromoCode(newCode.trim().toUpperCase());
      setNewCode('');
    } catch (err: any) {
      setError(err.message || 'Failed to add code.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteCode = async (codeId: string) => {
    if (window.confirm(`Are you sure you want to delete the code "${codeId}"?`)) {
      try {
        await deletePromoCode(codeId);
      } catch (err: any) {
        setError(err.message || 'Failed to delete code.');
      }
    }
  };
  
  const getSpecialUrl = () => {
    const url = new URL(window.location.href);
    url.search = '?promo=true';
    return url.toString();
  };

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(getSpecialUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading Promo Codes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-gray-900">Manage Freebie Codes</h3>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800 font-medium mb-2">Special Application URL</p>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            readOnly
            value={getSpecialUrl()}
            className="flex-grow p-2 border border-gray-300 rounded-md bg-white text-sm"
          />
          <Button variant="outline" onClick={copyUrlToClipboard}>
            <Copy className="w-4 h-4 mr-2" />
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Share this URL with churches you want to allow to apply for free. The promo code field will only appear when this link is used.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="Enter new code (e.g., G3FREE2024)"
            className="flex-grow p-2 border border-gray-300 rounded-md"
            disabled={isAdding}
          />
          <Button onClick={handleAddCode} isLoading={isAdding}>
            <Plus className="w-4 h-4 mr-2" />
            Add Code
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Promo Code
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created At
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {promoCodes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                  No promo codes found.
                </td>
              </tr>
            ) : (
              promoCodes.map((code) => (
                <tr key={code.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{code.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(code.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleDeleteCode(code.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
