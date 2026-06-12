import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import ConsultTimer from './components/ConsultTimer';
import FrontDeskBilling from './components/FrontDeskBilling';
import ServiceFee from './components/ServiceFee';
import UnpaidConsults from './components/UnpaidConsults';
import {
  searchConsults,
  getConsultByTransactionId,
  getPrivateFee,
  processFinalPayment,
  getRecentUnpaidConsults,
  getServiceFeeSummary,
  markServiceFeePaid,
  getDoctors,
  getUnpaidConsultsByDoctor,
} from './api/neon';

function BillingRoute() {
  const [searchParams] = useSearchParams();
  const preloadTransactionId = searchParams.get('preload') || null;

  return (
    <FrontDeskBilling
      getConsultByTransactionId={getConsultByTransactionId}
      getPrivateFee={getPrivateFee}
      searchConsults={searchConsults}
      processFinalPayment={processFinalPayment}
      getRecentUnpaidConsults={getRecentUnpaidConsults}
      preloadTransactionId={preloadTransactionId}
    />
  );
}

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
            <Route path="/billing" element={<BillingRoute />} />

            {/* Service Fee */}
            <Route 
              path="/service" 
              element={
                <ServiceFee
                  getServiceFeeSummary={getServiceFeeSummary}
                  markServiceFeePaid={markServiceFeePaid}
                />
              } 
            />

            {/* Unpaid Consults */}
            <Route 
              path="/unpaid" 
              element={
                <UnpaidConsults
                  getDoctors={getDoctors}
                  getUnpaidConsultsByDoctor={getUnpaidConsultsByDoctor}
                />
              } 
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}