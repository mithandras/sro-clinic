import { useState, useEffect, useRef } from 'react';

// panel keys: 'list' | 'review' | 'done'

export default function FrontDeskBilling({
  getConsultByTransactionId,
  getPrivateFee,
  searchConsults,
  getRecentUnpaidConsults,
  processFinalPayment,
  preloadTransactionId = null,
}) {
  const [panel, setPanel] = useState('list');
  const [selectedConsult, setSelectedConsult] = useState(null);
  const [privateFee, setPrivateFee] = useState(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [busyMode, setBusyMode] = useState(null); // 'BULK' | 'PRIVATE' while processing
  const [doneDesc, setDoneDesc] = useState('');
  const [recentConsults, setRecentConsults] = useState([]);
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

  // ── Preload flow ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (preloadTransactionId) {
      getConsultByTransactionId(preloadTransactionId)
        .then(consult => {
          if (consult) enterReview(consult);
          else showToast('Consultation record not found.', 'err');
        })
        .catch(() => showToast('Failed to load consultation.', 'err'));
    }
  }, []);

  // ── Load recent unpaid consults ───────────────────────────────────────────

  useEffect(() => {
    getRecentUnpaidConsults()
      .then(rows => setRecentConsults(rows || []))
      .catch(() => showToast('Failed to load patient list.', 'err'));
  }, []);

  // ── Select patient → review ───────────────────────────────────────────────

  function enterReview(consult) {
    setSelectedConsult(consult);
    setPrivateFee(null);
    setFeeLoading(true);
    setToast(null);
    setPanel('review');

    getPrivateFee(consult.doctor_id, consult.mbs_level, consult.is_after_hours)
      .then(feeData => {
        setPrivateFee(feeData);
        setFeeLoading(false);
      })
      .catch(() => {
        setFeeLoading(false);
        showToast('Could not load private fee. Bulk bill only.', 'err');
      });
  }

  // ── Confirm payment ───────────────────────────────────────────────────────

  async function confirmPayment(mode) {
    const isPrivate = mode === 'PRIVATE';
    const total = isPrivate ? (privateFee?.private_fee ?? selectedConsult.gross_amount) : 0;
    const gap   = isPrivate ? (privateFee?.gap_amount  ?? 0) : 0;

    setBusyMode(mode);

    try {
      const res = await processFinalPayment(selectedConsult.id, mode, total, gap);
      setDoneDesc(
        isPrivate
          ? `${selectedConsult.patient_name} — private billing recorded. Patient charged $${fmt(total)}, Medicare rebate $${fmt(privateFee?.mbs_rebate)}, gap $${fmt(gap)}.`
          : `${selectedConsult.patient_name} — bulk billed. Medicare pays doctor $${fmt(selectedConsult.gross_amount)}.`
      );
      setPanel('done');
    } catch {
      showToast('Billing failed — please try again.', 'err');
    } finally {
      setBusyMode(null);
    }
  }

  // ── Refresh and return to list ────────────────────────────────────────────

  function returnToList() {
    setPanel('list');
    setSelectedConsult(null);
    setPrivateFee(null);
    setDoneDesc('');
    setToast(null);
    getRecentUnpaidConsults()
      .then(rows => setRecentConsults(rows || []))
      .catch(() => showToast('Failed to refresh patient list.', 'err'));
  }

  // ── Derived fee values ────────────────────────────────────────────────────

  const privateTotal = privateFee?.private_fee ?? null;
  const mbsRebate    = privateFee?.mbs_rebate  ?? null;
  const gap          = privateFee?.gap_amount   ?? null;
  const bulkTotal    = selectedConsult?.gross_amount ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

        <div className="bg-blue-600 px-6 py-4">
          <h1 className="text-white text-xl font-bold tracking-wide">FRONT DESK BILLING</h1>
        </div>

        <div className="p-6">

          {/* ── LIST PANEL ──────────────────────────────────────────────── */}
          {panel === 'list' && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Unpaid consults — last 7 days
              </p>

              {recentConsults.length === 0 && (
                <div className="text-center text-gray-400 py-10 border-2 border-dashed border-gray-200 rounded-xl text-sm">
                  No unpaid consults in the last 7 days.
                </div>
              )}

              <div className="divide-y divide-gray-100">
                {recentConsults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => enterReview(c)}
                    className="py-3 px-1 cursor-pointer hover:bg-gray-50 transition rounded"
                  >
                    <div className="font-medium text-gray-800">{c.patient_name}</div>
                    <div className="text-sm text-gray-500">
                      Level {c.mbs_level} · ${fmt(c.gross_amount)} · {c.doctor_name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── REVIEW PANEL ────────────────────────────────────────────── */}
          {panel === 'review' && selectedConsult && (
            <div className="space-y-4">

              <div className="mb-2">
                <h2 className="text-2xl font-bold text-gray-800">{selectedConsult.patient_name}</h2>
                <div className="text-gray-500 mt-1">
                  Level {selectedConsult.mbs_level} · {selectedConsult.doctor_name}
                </div>
              </div>

              {/* Bulk Bill */}
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🏥</span>
                  <div>
                    <div className="font-bold text-gray-800">Bulk Bill — ${fmt(bulkTotal)}</div>
                    <div className="text-sm text-gray-500">Medicare pays doctor. Patient pays nothing.</div>
                  </div>
                </div>
                <button
                  onClick={() => confirmPayment('BULK')}
                  disabled={!!busyMode}
                  className="w-full bg-gray-800 text-white font-bold py-2.5 rounded-lg hover:bg-gray-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busyMode === 'BULK' ? 'Processing…' : 'Confirm Bulk Bill'}
                </button>
              </div>

              {/* Private */}
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-2xl">💳</span>
                  <div className="font-bold text-gray-800">
                    Private — {feeLoading ? 'calculating…' : `$${fmt(privateTotal)}`}
                  </div>
                </div>

                {!feeLoading && privateFee && (
                  <div className="grid grid-cols-2 gap-y-1 text-sm mb-3 mt-2 pl-1">
                    <span className="text-gray-500">Patient pays</span>
                    <span className="font-medium text-gray-800">${fmt(privateTotal)}</span>
                    <span className="text-gray-500">Medicare rebate</span>
                    <span className="font-medium text-gray-800">${fmt(mbsRebate)}</span>
                    <span className="text-gray-500">Gap (out of pocket)</span>
                    <span className="font-bold text-gray-900">${fmt(gap)}</span>
                  </div>
                )}

                {feeLoading && (
                  <div className="text-sm text-gray-400 mb-3 mt-2 pl-1">Loading fee details…</div>
                )}

                <button
                  onClick={() => confirmPayment('PRIVATE')}
                  disabled={!!busyMode || feeLoading || !privateFee}
                  className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busyMode === 'PRIVATE' ? 'Processing…' : `Confirm Private — $${fmt(privateTotal)}`}
                </button>
              </div>

              <div className="text-center pt-1">
                <button
                  onClick={() => setPanel('list')}
                  className="text-slate-400 text-sm underline"
                >
                  ← Back to patient list
                </button>
              </div>
            </div>
          )}

          {/* ── DONE PANEL ──────────────────────────────────────────────── */}
          {panel === 'done' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Billing Complete</h2>
              <p className="text-gray-500 mb-6 leading-relaxed">{doneDesc}</p>
              <button
                onClick={returnToList}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition"
              >
                Back to Patient List
              </button>
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