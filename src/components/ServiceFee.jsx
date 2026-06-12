import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function ServiceFee({
  getServiceFeeSummary,
  markServiceFeePaid,
}) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null); // { msg, type: 'err' | 'ok' }
  const toastTimer = useRef(null);

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(msg, type = 'ok') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    if (type !== 'err') {
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    }
  }

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmt(val) {
    return val == null || val === '' ? '0.00' : parseFloat(val).toFixed(2);
  }

  // ── Load summary ──────────────────────────────────────────────────────────

  function loadSummary() {
    setLoading(true);
    getServiceFeeSummary()
      .then(rows => setDoctors(rows || []))
      .catch(() => showToast('Failed to load service fee summary.', 'err'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSummary();
  }, []);

  // ── Mark paid ─────────────────────────────────────────────────────────────

  function startConfirm(doctorId) {
    setConfirmingId(doctorId);
  }

  function cancelConfirm() {
    setConfirmingId(null);
  }

  async function confirmPaid(doctor) {
    setBusyId(doctor.doctor_id);

    try {
      const res = await markServiceFeePaid(doctor.doctor_id);

      if (res?.error) {
        showToast(res.error, 'err');
        return;
      }

      showToast(
        `${doctor.doctor_name} — marked ${res.consultsPaid} consult(s) paid, $${fmt(res.amountSettled)} settled.`
      );
      setConfirmingId(null);
      loadSummary();
    } catch {
      showToast('Failed to mark service fee as paid — please try again.', 'err');
    } finally {
      setBusyId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

        <div className="bg-blue-600 px-6 py-4">
          <h1 className="text-white text-xl font-bold tracking-wide">SERVICE FEE</h1>
        </div>

        <div className="p-6">

          {loading && (
            <div className="text-center text-gray-400 py-10 text-sm">
              Loading service fee summary…
            </div>
          )}

          {!loading && doctors.length === 0 && (
            <div className="text-center text-gray-400 py-10 border-2 border-dashed border-gray-200 rounded-xl text-sm">
              No outstanding service fees.
            </div>
          )}

          {!loading && doctors.length > 0 && (
            <div className="divide-y divide-gray-100">
              {doctors.map(doc => (
                <div key={doc.doctor_id} className="py-4 px-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-800">{doc.doctor_name}</div>
                      <div className="text-sm text-gray-500">
                        {doc.consult_count} consult{doc.consult_count === 1 ? '' : 's'} · fee ${fmt(doc.service_fee)} + GST ${fmt(doc.gst_amount)}
                      </div>
                      {doc.unpaid_consult_count > 0 && (
                        <Link
                          to={`/unpaid?doctor=${doc.doctor_id}`}
                          className="text-sm text-blue-600 underline"
                        >
                          ({doc.unpaid_consult_count} unpaid — ${fmt(doc.unpaid_amount)} pending)
                        </Link>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-bold text-gray-900 mb-1">${fmt(doc.total_owing)}</div>

                      {doc.total_owing > 0 && (
                        confirmingId === doc.doctor_id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={cancelConfirm}
                              disabled={busyId === doc.doctor_id}
                              className="text-xs font-bold text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition disabled:opacity-40"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => confirmPaid(doc)}
                              disabled={busyId === doc.doctor_id}
                              className="text-xs font-bold text-white bg-green-600 rounded-lg px-2.5 py-1.5 hover:bg-green-700 transition disabled:opacity-40"
                            >
                              {busyId === doc.doctor_id ? 'Saving…' : 'Confirm'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startConfirm(doc.doctor_id)}
                            className="text-xs font-bold text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 transition"
                          >
                            PAID
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mt-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between gap-3 ${
            toast.type === 'err'
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}
        >
          <span>{toast.type === 'err' ? '⚠ ' : '✓ '}{toast.msg}</span>
          <button onClick={() => setToast(null)} className="text-lg leading-none opacity-50 hover:opacity-100">×</button>
        </div>
      )}
    </div>
  );
}