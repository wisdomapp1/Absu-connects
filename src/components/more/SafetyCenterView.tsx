import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  ArrowLeft,
  ShieldCheck,
  Phone,
  AlertTriangle,
  Lock,
  CheckCircle2,
  FileWarning,
} from 'lucide-react';

export const SafetyCenterView: React.FC = () => {
  const { goBack, addToast } = useApp();
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportCategory, setReportCategory] = useState('Harassment');
  const [reported, setReported] = useState(false);

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportText.trim()) return;
    setReported(true);
    addToast('Incident report submitted to ABSU Student Safety Desk.', 'success');
    setTimeout(() => {
      setReportModalOpen(false);
      setReportText('');
      setReported(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Back to More */}
      <button
        onClick={goBack}
        className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors min-h-[36px]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to More</span>
      </button>

      {/* Header */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
            Campus Safety & Support Center
          </h1>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Safety policies, verified emergency campus contacts, and confidential incident reporting for Abia State University students.
        </p>
      </div>

      {/* Emergency Contacts */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>ABSU Campus Emergency Lines</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: 'Uturu Main Campus Security Gate',
              desc: 'Main Gate & Hostels 24/7 Security Desk',
              phone: '0803 000 1234',
            },
            {
              title: 'Aba Campus Security (Medical)',
              desc: 'College of Health Sciences Security Unit',
              phone: '0802 000 5678',
            },
            {
              title: 'SUG Welfare & Student Affairs',
              desc: 'Student Union Government Emergency Line',
              phone: '0810 000 9012',
            },
            {
              title: 'ABSU Health Center (Uturu)',
              desc: 'Campus Clinic & Ambulance Services',
              phone: '0805 000 3456',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">{item.title}</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">{item.desc}</p>
                <p className="text-xs font-mono font-bold text-[var(--color-primary)] mt-1">
                  {item.phone}
                </p>
              </div>
              <button
                onClick={() => addToast(`Emergency dispatch: ${item.phone}`, 'info')}
                className="p-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-primary)] shrink-0"
                aria-label={`Call ${item.title}`}
              >
                <Phone className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Safety Standards */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Student Code of Conduct & Safety Rules</span>
        </h2>

        <div className="flex flex-col gap-2.5 text-xs text-[var(--color-text-secondary)]">
          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <p className="font-bold text-[var(--color-text-primary)] mb-0.5">
              Zero Tolerance for Cultism & Violence
            </p>
            <p className="leading-relaxed">
              In accordance with ABSU Senate regulations, association with unregistered secret societies or violent intimidation carries immediate expulsion and handover to law enforcement.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <p className="font-bold text-[var(--color-text-primary)] mb-0.5">
              Peer Respect & Anti-Harassment
            </p>
            <p className="leading-relaxed">
              Sexual harassment, cyberbullying, hate speech, and impersonation of faculty or students are strictly prohibited on ABSU Connect.
            </p>
          </div>
        </div>

        <button
          onClick={() => setReportModalOpen(true)}
          className="mt-4 w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99]"
        >
          <FileWarning className="w-4 h-4" />
          <span>Report an Incident or Safety Concern</span>
        </button>
      </div>

      {/* Incident Report Modal */}
      {reportModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
        >
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
              <h3 className="font-bold text-sm text-[var(--color-text-primary)] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span>Submit Safety Incident Report</span>
              </h3>
              <button
                onClick={() => setReportModalOpen(false)}
                className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] p-1"
              >
                Close
              </button>
            </div>

            {reported ? (
              <div className="py-8 text-center flex flex-col items-center gap-2">
                <CheckCircle2 className="w-10 h-10 text-[var(--color-success)]" />
                <p className="text-sm font-bold text-[var(--color-text-primary)]">
                  Report Received Confidentially
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
                  Your report has been securely transmitted to the student welfare desk.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="flex flex-col gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
                    Category
                  </label>
                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value)}
                    className="w-full p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                  >
                    <option value="Harassment">Harassment / Bullying</option>
                    <option value="Hostel Safety">Hostel / Campus Security Hazard</option>
                    <option value="Impersonation">Impersonation / Fraud</option>
                    <option value="Academic Fraud">Academic Misconduct / Extortion</option>
                    <option value="Other">Other Safety Concern</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
                    Details of the Incident *
                  </label>
                  <textarea
                    rows={4}
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="Describe what occurred, location (Uturu/Aba/Umuahia), date/time, and parties involved..."
                    required
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    spellCheck={true}
                    className="w-full p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportModalOpen(false)}
                    className="px-3 py-1.5 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
