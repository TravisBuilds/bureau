import { AlertTriangle } from 'lucide-react';

export default function PrototypeBanner() {
  return (
    <div className="bg-red-600 text-white py-3 px-6 flex items-center justify-center gap-3">
      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
      <div className="font-medium text-center">
        <strong>PROTOTYPE</strong> — No real money, not an offer of securities
      </div>
    </div>
  );
}
