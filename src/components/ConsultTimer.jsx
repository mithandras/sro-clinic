import { useState, useEffect, useRef } from 'react';
import { getDoctors, searchPatients, getMbsLevels, createTransaction } from '../api/neon';

const SETTINGS = ['Consulting Rooms', 'Telehealth Video', 'Telehealth Phone', 'Aged Care (RACF)'];

export default function ConsultTimer({ onLog }) {
  const [doctors, setDoctors] = useState([]);
  const [mbsLevels, setMbsLevels] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [setting, setSetting] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [panel, setPanel] = useState('setup');
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [patient, setPatient] = useState(null);
  const [suggestedLevel, setSuggestedLevel] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [dailyCount, setDailyCount] = useState(0);
  const [log, setLog] = useState(['System initialized...']);
  const timerRef = useRef(null);

  useEffect(() => {
    getDoctors()
      .then(data => {
        setDoctors(data);
        addLog('Practitioners loaded successfully');
      })
      .catch(() => addLog('Failed to load doctors'));
    getMbsLevels()
      .then(setMbsLevels)
      .catch(() => addLog('Failed to load MBS levels'));
  }, []);

  useEffect(() => {
    if (searchTerm.length < 3) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      searchPatients(searchTerm).then(setSearchResults).catch(() => addLog('Patient search failed'));
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  function addLog(msg) {
    const time = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setLog(prev => [`[${time}] ${msg}`, ...prev]);
  }

  function startConsult() {
    const doctor = doctors.find(d => d.id === doctorId);
    const now = new Date();
    setStartTime(now);
    setElapsed(0);
    setPanel('timer');
    addLog(`Starting consultation for ${doctor?.full_name}...`);
    setTimeout(() => addLog(`Consultation started for ${doctor?.full_name}`), 200);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }

  function endConsult() {
    clearInterval(timerRef.current);
    const mins = Math.floor(elapsed / 60);
    const level = [...mbsLevels].reverse().find(l => mins >= l.min_minutes);
    setSuggestedLevel(level ? level.level_code : mbsLevels[0]?.level_code);
    setSelectedLevel(level ? level.level_code : mbsLevels[0]?.level_code);
    setPanel('review');
  }

  async function finalise() {
    const doctor = doctors.find(d => d.id === doctorId);
    const level = mbsLevels.find(l => l.level_code === selectedLevel);
    const grossAmount = parseFloat(level?.normal_fee || 0);
    const doctorShare = parseFloat((grossAmount * (1 - doctor.service_fee_percentage / 100)).toFixed(2));
    const clinicShare = parseFloat((grossAmount - doctorShare).toFixed(2));
    const endTime = new Date();

    addLog(`Finalising — Level ${selectedLevel} for ${doctor?.full_name}...`);

    try {
      await createTransaction({
        doctorId, patientId: patient?.id || null,
        startTime: startTime.toISOString(), endTime: endTime.toISOString(),
        durationMin: Math.floor(elapsed / 60), mbsLevel: selectedLevel,
        setting, grossAmount, doctorShare, clinicShare, isAfterHours: false,
      });

      const newCount = dailyCount + 1;
      setDailyCount(newCount);
      const today = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });

      addLog(`Level ${selectedLevel} consultation recorded for ${doctor?.full_name}`);
      setTimeout(() => addLog(`${doctor?.full_name} has completed ${newCount} consult(s) today (${today})`), 200);
      setTimeout(() => addLog(`Ready for next consult — ${doctor?.full_name}`), 400);

      if (onLog) onLog();
      resetForNextConsult(doctorId, setting);
    } catch {
      addLog('ERROR: Failed to record session');
    }
  }

  function resetForNextConsult(keepDoctorId, keepSetting) {
    setPanel('setup');
    setDoctorId(keepDoctorId);
    setSetting(keepSetting);
    setConfirmed(false);
    setPatient(null);
    setSearchTerm('');
    setSearchResults([]);
    setElapsed(0);
    setStartTime(null);
  }

  function discardSession() {
    const doctor = doctors.find(d => d.id === doctorId);
    addLog(`Session discarded for ${doctor?.full_name}`);
    resetForNextConsult(doctorId, setting);
  }

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  const doctor = doctors.find(d => d.id === doctorId);

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-blue-600 px-6 py-4">
          <h1 className="text-white text-xl font-bold tracking-wide">MBS CONSULT TIMER</h1>
        </div>

        <div className="p-6">

          {panel === 'setup' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Practitioner</label>
                <select value={doctorId} onChange={e => setDoctorId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select practitioner...</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinical Setting</label>
                <select value={setting} onChange={e => setSetting(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select setting...</option>
                  {SETTINGS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="confirm" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                  className="w-5 h-5 accent-blue-600" />
                <label htmlFor="confirm" className="text-sm font-medium text-gray-700 cursor-pointer">
                  I confirm the practitioner and setting are correct
                </label>
              </div>

              <button onClick={startConsult} disabled={!doctorId || !setting || !confirmed}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition">
                START CONSULTATION
              </button>
            </div>
          )}

          {panel === 'timer' && (
            <div className="space-y-4">
              <div className="text-center font-bold text-blue-600">{doctor?.full_name}</div>
              <div className="text-center text-6xl font-mono font-bold text-gray-800 py-4">{formatTime(elapsed)}</div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Patient Search</label>
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Type 3+ letters to search..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1">
                    {searchResults.map(p => (
                      <div key={p.id} onClick={() => { setPatient(p); setSearchTerm(''); setSearchResults([]); }}
                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm">
                        {p.first_name} {p.last_name} — {p.dob}
                      </div>
                    ))}
                  </div>
                )}
                {patient && (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-2">
                    <span className="text-sm font-medium text-blue-800">{patient.first_name} {patient.last_name}</span>
                    <button onClick={() => setPatient(null)} className="text-red-500 text-lg font-bold">×</button>
                  </div>
                )}
              </div>

              <button onClick={endConsult}
                className="w-full bg-gray-800 text-white font-bold py-3 rounded-lg hover:bg-gray-900 transition">
                FINISH CONSULT
              </button>
            </div>
          )}

          {panel === 'review' && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 border-l-4 border-gray-800">
                <h3 className="font-bold text-gray-800 mb-3">Final Review</h3>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-gray-500">Doctor</span><span className="font-medium">{doctor?.full_name}</span>
                  <span className="text-gray-500">Patient</span><span className="font-medium">{patient ? `${patient.first_name} ${patient.last_name}` : 'Anonymous'}</span>
                  <span className="text-gray-500">Setting</span><span className="font-medium">{setting}</span>
                  <span className="text-gray-500">Duration</span><span className="font-medium">{Math.floor(elapsed / 60)} min</span>
                  <span className="text-gray-500">Suggested</span><span className="font-bold text-blue-600 text-base">{suggestedLevel}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm MBS Level</label>
                <select value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)}
                  className="w-full border-2 border-blue-500 rounded-lg px-3 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {mbsLevels.map(l => <option key={l.level_code} value={l.level_code}>{l.level_code} — {l.description}</option>)}
                </select>
              </div>

              <button onClick={finalise}
                className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 transition">
                FINALISE & RECORD SESSION
              </button>
              <div className="text-center">
                <button onClick={discardSession} className="text-red-500 text-sm">Discard Session</button>
              </div>
            </div>
          )}

        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">System Log</label>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 h-24 overflow-y-auto font-mono text-xs text-gray-500">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}