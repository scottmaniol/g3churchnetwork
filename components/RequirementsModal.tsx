import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface RequirementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

export const RequirementsModal: React.FC<RequirementsModalProps> = ({
  isOpen,
  onClose,
  onContinue,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset scroll state when modal opens
      setScrolledToBottom(false);
      // Check immediately if content is not scrollable at all
      if (contentRef.current) {
        const { scrollHeight, clientHeight } = contentRef.current;
        if (scrollHeight <= clientHeight) {
          setScrolledToBottom(true);
        }
      }
    }
  }, [isOpen]);

  const handleScroll = () => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 5) { // 5px buffer
        setScrolledToBottom(true);
      } else {
        setScrolledToBottom(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          {/* Header */}
          <div className="bg-black px-6 py-4 flex items-center justify-between">
            <h3 className="text-2xl font-serif font-bold text-white">
              Before You Apply
            </h3>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-white transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div ref={contentRef} onScroll={handleScroll} className="px-6 py-6 max-h-[70vh] overflow-y-auto">
            {/* Goals Section */}
            <div className="mb-8">
              <h4 className="text-xl font-serif font-bold text-gray-900 mb-3">
                Goals
              </h4>
              <p className="text-gray-700 leading-relaxed">
                The goal of the G3 Church Network is to be a ministry connection point for pastors and local churches. Our aim is to engage in joyful ministry together for the glory of God. However, our goal is not to become a denomination, nor is it our desire to encourage others to separate from all other networks in order to join the G3 Church Network. We are not mutually exclusive to other networks and denominations.
              </p>
            </div>

            {/* Minimal Requirements Section */}
            <div>
              <h4 className="text-xl font-serif font-bold text-gray-900 mb-3">
                Minimal Requirements
              </h4>
              <p className="text-gray-700 mb-4">
                In order to become a member of the G3 Church Network, the following minimal requirements must be reached.
              </p>

              <div className="space-y-6">
                {/* 1689 Confession */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-900 mb-2">
                    1689 London Baptist Confession
                  </h5>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    The pastors of the church must, at a minimum, affirm the 1689 even if the church's statement of faith is not officially the 1689.
                  </p>
                  <p className="text-gray-600 text-sm mt-2 italic">
                    If you cannot affirm everything within the 1689 or if you have some qualifications, you can provide an explanation of the qualifications in your application. Our aim is to be as likeminded as possible as we unite around common doctrinal standards.
                  </p>
                </div>

                {/* Statement on Social Justice */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-900 mb-2">
                    Statement on Social Justice and the Gospel
                  </h5>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    The pastors or the church must be willing to sign the SSJ&G. If for some reason the pastors are unable to sign based on a convictional manner, an explanation will be necessary.
                  </p>
                </div>

                {/* Financial Commitment */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-900 mb-2">
                    Financial Commitment
                  </h5>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    The minimal financial commitment for a local church to become a member of the G3 Church Network is <span className="font-semibold">$500 / yr</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-end space-x-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onContinue} disabled={!scrolledToBottom}>
              Continue to Application
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
