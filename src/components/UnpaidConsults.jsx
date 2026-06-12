import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function UnpaidConsults({
  getDoctors,
  getUnpaidConsultsByDoctor,
}) {
  const [searchParams] = useSearchParams();
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [consults, setConsults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmt(val) {
    return val == null || val === '' ? '0.00' : parseFloat(val).toFixed(2);
  }

  function fmtDate(val) {
    if (!val) return '';
    return new Date(val).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  // ── Load doctors, apply ?doctor= preselect ───────────────────────────────

  useEffect(() => {
    getDoctors()
      .then(rows => {
        setDoctors(rows || []);
        const preselect = searchParams.get('doctor');
        if (preselect) setSelectedDoctorId(preselect);
      })
      .catch(() => setError('Failed to load doctor list.'));
  }, []);

  // ── Load unpaid consults whenever the selected doctor changes ────────────

  useEffect(() => {
    if (!selectedDoctorId) {
      setConsults([]);
      return;
    }

    setLoading(true);
    setError(null);

    getUnpaidConsultsByDoctor(selectedDoctorId)
      .then(rows => setConsults(rows || []))
      .catch(() => setError('Failed to load unpaid consults.'))
      .finally(() => setLoading(false));
  }, [selectedDoctorId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

        <div className="bg-blue-600 px-6 py-4">
          <h1 className="text-white text-xl font-bold tracking-wide">UNPAID CONSULTS</h1>
        </div>

        <div className="p-6">

          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Doctor
          </label>
          <select
            value={selectedDoctorId}
            onChange={e => setSelectedDoctorId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-4 text-gray-800"
          >
            <option value="">Select a doctor…</option>
            {doctors.map(doc => (
              <option key={doc.id} value={doc.id}>{doc.full_name}</option>
            ))}
          </select>

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium bg-red-50 border border-red-200 text-red-700 mb-4">
              ⚠ {error}
            </div>
          )}

          {!selectedDoctorId && !error && (
            <div className="text-center text-gray-400 py-10 border-2 border-dashed border-gray-200 rounded-xl text-sm">
              Select a doctor to view their unpaid consults.
            </div>
          )}

          {selectedDoctorId && loading && (
            <div className="text-center text-gray-400 py-10 text-sm">
              Loading unpaid consults…
            </div>
          )}

          {selectedDoctorId && !loading && consults.length === 0 && !error && (
            <div className="text-center text-gray-400 py-10 border-2 border-dashed border-gray-200 rounded-xl text-sm">
              No unpaid consults for this doctor.
            </div>
          )}

          {selectedDoctorId && !loading && consults.length > 0 && (
            <div className="divide-y divide-gray-100">
              {consults.map(c => (
                <Link
                  key={c.transaction_id}
                  to={`/billing?preload=${c.transaction_id}`}
                  className="block py-3 px-1 hover:bg-gray-50 transition rounded"
                >
                  <div className="font-medium text-gray-800">{c.patient_name}</div>
                  <div className="text-sm text-gray-500">
                    {fmtDate(c.start_time)} · Level {c.mbs_level} · ${fmt(c.gross_amount)}
                  </div>
                </Link>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}