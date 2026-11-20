import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  ShoppingBag,
  Sparkles,
  ArrowLeft,
  Bell,
  MapPin,
  CheckCircle2,
  Tag,
  BookOpen,
  Compass,
  Laptop,
  Flame,
  ShieldCheck,
} from 'lucide-react';

const PLANNED_CATEGORIES = [
  {
    id: 'cat_textbooks',
    title: 'Textbooks & Past Questions',
    description: 'Buy and exchange GST handbooks, faculty textbooks, and past question booklets from seniors.',
    icon: BookOpen,
    badge: 'Academics',
  },
  {
    id: 'cat_drafting',
    title: 'Drafting & Engineering Kits',
    description: 'T-squares, drawing boards, architectural kits, and dissection sets for pre-clinical students.',
    icon: Compass,
    badge: 'Equipment',
  },
  {
    id: 'cat_hostel',
    title: 'Hostel Appliances & Furniture',
    description: 'Electric kettles, study lamps, reading desks, and mini fans for campus lodge living.',
    icon: Laptop,
    badge: 'Hostel Life',
  },
  {
    id: 'cat_services',
    title: 'Campus Services & Peer Tutoring',
    description: 'Graphics design, typing services, coding tutoring, and campus event photography by students.',
    icon: Sparkles,
    badge: 'Student Services',
  },
];

export const MarketplacePreview: React.FC = () => {
  const { goBack, addToast } = useApp();
  const [notified, setNotified] = useState(false);

  const handleNotify = () => {
    setNotified(true);
    addToast('You will be notified when ABSU Marketplace v2 launches!', 'success');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <button
        onClick={goBack}
        className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to More</span>
      </button>

      {/* Hero Teaser Banner */}
      <div className="bg-gradient-to-br from-amber-500/15 via-[var(--color-primary-subtle)] to-[var(--color-bg-card)] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-sm transition-colors relative overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
            Coming Soon — Version 2
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
          ABSU Campus Marketplace
        </h1>

        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed max-w-xl">
          A dedicated student-to-student marketplace currently in development for Abia State University. Buy and sell used textbooks, architectural drafting kits, laboratory apparatus, hostel appliances, and student tutoring services safely within the campus community.
        </p>

        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center gap-3 flex-wrap">
          <button
            onClick={handleNotify}
            disabled={notified}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 ${
              notified
                ? 'bg-[var(--color-success)] text-white'
                : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white'
            }`}
          >
            {notified ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Notification Registered!</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                <span>Notify Me on Launch</span>
              </>
            )}
          </button>

          <span className="text-[11px] text-[var(--color-text-secondary)] italic">
            Zero commission · Verified student identity · Campus pickup
          </span>
        </div>
      </div>

      {/* Honest Status Notice Card */}
      <div className="p-3.5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-start gap-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold text-[var(--color-text-primary)]">
            Marketplace Status:
          </span>{' '}
          <span className="text-[var(--color-text-secondary)]">
            To prevent fraud and maintain safety, marketplace listings will activate in Version 2 with verified matriculation numbers and secure in-person pickup points across Uturu and Aba campuses.
          </span>
        </div>
      </div>

      {/* Planned Categories Grid */}
      <div>
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-3 px-1">
          Planned Campus Categories
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLANNED_CATEGORIES.map((cat) => {
            const IconComponent = cat.icon;
            return (
              <div
                key={cat.id}
                className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm flex flex-col justify-between transition-colors hover:border-[var(--color-primary)]/40"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-[10px] tracking-wide uppercase px-2 py-0.5 rounded-md bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
                      {cat.badge}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
                      <IconComponent className="w-4 h-4" />
                    </div>
                  </div>

                  <h3 className="font-bold text-sm text-[var(--color-text-primary)] leading-snug">
                    {cat.title}
                  </h3>

                  <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                    {cat.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-[11px] text-[var(--color-text-secondary)]">
                  <span className="font-medium">Uturu & Aba Campuses</span>
                  <span className="text-[10px] font-semibold text-[var(--color-primary)]">
                    Available at launch
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

