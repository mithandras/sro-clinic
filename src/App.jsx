import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ConsultTimer from './components/ConsultTimer';
import FrontDeskBilling from './components/FrontDeskBilling';
import {
  searchConsults,
  getConsultByTransactionId,
  getPrivateFee,
  processFinalPayment,
  getRecentUnpaidConsults,
} from './api/neon';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100 py-8">
        <div className="max-w-md mx-auto px-4">
          <Routes>
            {/* Default route */}
            <Route path="/" element={<Navigate to="/consult" replace />} />
            
            {/* Consult Timer */}
            <Route path="/consult" element={<ConsultTimer />} />
            
            {/* Front Desk Billing */}
            <Route 
              path="/billing" 
              element={
                <FrontDeskBilling
                  getConsultByTransactionId={getConsultByTransactionId}
                  getPrivateFee={getPrivateFee}
                  searchConsults={searchConsults}
                  processFinalPayment={processFinalPayment}
                  getRecentUnpaidConsults={getRecentUnpaidConsults}
                />
              } 
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}