import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Building2,
  Shield,
  Lock,
  MessageCircle,
  Bell,
  FileText,
  Users,
  BadgeCheck,
  Activity,
  Database,
  AlertTriangle,
} from 'lucide-react';
import {
  CanonicalPageRole,
  Page,
  PageManagerRole,
  PageSettingsSectionId,
} from '../../types/pages.ts';
import {
  formatPageRoleLabel,
  getPageRoleCapabilities,
  normalizePageRole,
} from '../../lib/pageUtils.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import {
  PageInfoSection,
  PageAccessRolesSection,
  PagePrivacySection,
  PageMessagingSection,
  PageNotificationsSection,
  PageContentSection,
  PageFollowersSection,
  PageVerificationSection,
  PageActivityLogsSection,
  PageDataStorageSection,
  PageDangerZoneSection,
} from './settings/PageSettingsSections.tsx';

interface PageSettingsViewProps {
  page: Page;
  role: PageManagerRole | CanonicalPageRole;
}

interface SettingsCategoryCard {
  id: PageSettingsSectionId;
  title: string;
  description: string;
  meta?: string;
  group: 'Identity & Access' | 'Privacy & Communications' | 'Content & Community' | 'Verification & Operations';
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
  tone?: 'default' | 'danger';
}

const VALID_SECTION_IDS = new Set<PageSettingsSectionId>([
  'info',
  'access',
  'privacy',
  'messaging',
  'notifications',
  'content',
  'followers',
  'verification',
  'activity',
  'data',
  'danger',
]);

export const PageSettingsView: React.FC<PageSettingsViewProps> = ({ page, role }) => {
  const {
    selectedPageTab,
    activeIdentity,
    goBack,
    refreshManagedPages,
    switchIdentity,
    navigateTo,
  } = useApp();

  const normalizedRole = normalizePageRole(role);
  const caps = useMemo(() => getPageRoleCapabilities(normalizedRole), [normalizedRole]);

  const initialSection: PageSettingsSectionId | null = useMemo(() => {
    if (selectedPageTab && VALID_SECTION_IDS.has(selectedPageTab as PageSettingsSectionId)) {
      return selectedPageTab as PageSettingsSectionId;
    }
    return null;
  }, [selectedPageTab]);

  const [activeSection, setActiveSection] = useState<PageSettingsSectionId | null>(initialSection);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingLeaveTarget, setPendingLeaveTarget] = useState<'hub' | 'back' | null>(null);

  useEffect(() => {
    if (selectedPageTab && VALID_SECTION_IDS.has(selectedPageTab as PageSettingsSectionId)) {
      setActiveSection(selectedPageTab as PageSettingsSectionId);
    } else if (!selectedPageTab) {
      setActiveSection(null);
    }
    setIsDirty(false);
  }, [selectedPageTab, page.id]);

  const syncUpdatedIdentity = useCallback(async () => {
    await refreshManagedPages();
    if (activeIdentity.type === 'page' && activeIdentity.pageId === page.id) {
      await switchIdentity(page.id);
    }
  }, [refreshManagedPages, activeIdentity, page.id, switchIdentity]);

  const categories: SettingsCategoryCard[] = useMemo(
    () => [
      {
        id: 'info',
        title: 'Page Information & Branding',
        description: 'Name, @handle, category, bio, contact links, avatar, and cover photo',
        meta: `@${page.slug}`,
        group: 'Identity & Access',
        icon: Building2,
        visible: true,
      },
      {
        id: 'access',
        title: 'Page Access & Team Roles',
        description: 'Manage Owners, Admins, Editors, Moderators, and ownership transfer',
        meta: formatPageRoleLabel(normalizedRole),
        group: 'Identity & Access',
        icon: Shield,
        visible: true,
      },
      {
        id: 'privacy',
        title: 'Privacy & Safety',
        description: 'Directory visibility, comment/message boundaries, blocks, and restricted accounts',
        meta: page.is_discoverable === false ? 'Hidden from discovery' : 'Discoverable',
        group: 'Privacy & Communications',
        icon: Lock,
        visible: caps.canEditPrivacy || caps.canManageFollowers,
      },
      {
        id: 'messaging',
        title: 'Messaging & Auto-Replies',
        description: 'Direct messages, welcome greeting, away mode, and team inbox roles',
        meta: page.allowMessages === false ? 'Messages off' : 'Inbox active',
        group: 'Privacy & Communications',
        icon: MessageCircle,
        visible: caps.canEditMessagingSettings || caps.canUseInbox,
      },
      {
        id: 'notifications',
        title: 'Page Notifications',
        description: 'Granular alerts for followers, inbox messages, comments, and team updates',
        group: 'Privacy & Communications',
        icon: Bell,
        visible: caps.canEditNotificationPrefs,
      },
      {
        id: 'content',
        title: 'Content & Post Management',
        description: 'Publishing rules, hidden keyword filters, and pin/hide/delete Page posts',
        meta: `${(page.postsCount ?? page.posts_count ?? 0).toLocaleString()} posts`,
        group: 'Content & Community',
        icon: FileText,
        visible: caps.canModeratePosts || caps.canEditPrivacy,
      },
      {
        id: 'followers',
        title: 'Followers & Community',
        description: 'Search followers, invite friends, restrict interactions, or block accounts',
        meta: `${page.followersCount.toLocaleString()} followers`,
        group: 'Content & Community',
        icon: Users,
        visible: caps.canManageFollowers,
      },
      {
        id: 'verification',
        title: 'Verification & Trust',
        description: 'Verification readiness checklist, request submission, and review history',
        meta: page.isVerified ? 'Verified Page' : 'Unverified',
        group: 'Verification & Operations',
        icon: BadgeCheck,
        visible: caps.canRequestVerification,
      },
      {
        id: 'activity',
        title: 'Activity & Audit Log',
        description: 'Chronological security log of team, content, and settings changes',
        group: 'Verification & Operations',
        icon: Activity,
        visible: caps.canViewAuditLogs,
      },
      {
        id: 'data',
        title: 'Media & Data Export',
        description: 'Cloudinary media inventory and downloadable JSON archive of Page data',
        group: 'Verification & Operations',
        icon: Database,
        visible: caps.canExportData,
      },
      {
        id: 'danger',
        title: 'Deactivation & Deletion',
        description: 'Temporarily deactivate Page or schedule 30-day soft deletion',
        meta: page.deletion_requested_at ? 'Deletion scheduled' : undefined,
        group: 'Verification & Operations',
        icon: AlertTriangle,
        visible: caps.canDisableOrDelete,
        tone: 'danger',
      },
    ],
    [page, normalizedRole, caps]
  );

  const visibleCategories = categories.filter((c) => c.visible);
  const activeMeta = visibleCategories.find((c) => c.id === activeSection) || null;

  const openSection = (sectionId: PageSettingsSectionId) => {
    setIsDirty(false);
    setActiveSection(sectionId);
    navigateTo('page-settings', { pageId: page.id, pageTab: sectionId });
  };

  const leaveToHub = () => {
    setIsDirty(false);
    setPendingLeaveTarget(null);
    setActiveSection(null);
    navigateTo('page-settings', { pageId: page.id });
  };

  const handleBackPress = () => {
    if (activeSection) {
      if (isDirty) {
        setPendingLeaveTarget('hub');
        return;
      }
      leaveToHub();
      return;
    }
    goBack();
  };

  const groupedCategories = useMemo(() => {
    const order: SettingsCategoryCard['group'][] = [
      'Identity & Access',
      'Privacy & Communications',
      'Content & Community',
      'Verification & Operations',
    ];
    return order
      .map((group) => ({
        group,
        items: visibleCategories.filter((c) => c.group === group),
      }))
      .filter((g) => g.items.length > 0);
  }, [visibleCategories]);

  const renderSectionContent = () => {
    if (!activeSection) return null;
    const commonProps = {
      page,
      caps,
      syncUpdatedIdentity,
      onDirtyChange: setIsDirty,
    };

    switch (activeSection) {
      case 'info':
        return <PageInfoSection {...commonProps} />;
      case 'access':
        return <PageAccessRolesSection {...commonProps} />;
      case 'privacy':
        return <PagePrivacySection {...commonProps} />;
      case 'messaging':
        return <PageMessagingSection {...commonProps} />;
      case 'notifications':
        return <PageNotificationsSection {...commonProps} />;
      case 'content':
        return <PageContentSection {...commonProps} />;
      case 'followers':
        return <PageFollowersSection {...commonProps} />;
      case 'verification':
        return <PageVerificationSection {...commonProps} />;
      case 'activity':
        return <PageActivityLogsSection {...commonProps} />;
      case 'data':
        return <PageDataStorageSection {...commonProps} />;
      case 'danger':
        return <PageDangerZoneSection {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleBackPress}
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center gap-1.5 text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] shrink-0"
            aria-label={activeSection ? 'Back to Settings' : 'Go back'}
          >
            <ArrowLeft className="w-5 h-5" />
            {activeSection && <span className="text-xs font-bold hidden sm:inline">Settings</span>}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-lg font-extrabold text-[var(--color-text-primary)] truncate">
                {activeMeta ? activeMeta.title : 'Page Settings'}
              </h1>
              {!activeMeta && page.isVerified && <VerifiedBadge size={16} />}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] truncate">
              {activeMeta
                ? `${page.name} · ${formatPageRoleLabel(normalizedRole)}`
                : `${page.name} · @${page.slug} · ${formatPageRoleLabel(normalizedRole)}`}
            </p>
          </div>
        </div>
      </div>

      {/* HUB LANDING SCREEN: Clickable Category Cards ONLY (Zero inline forms/inputs) */}
      {!activeSection ? (
        <div className="space-y-4">
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar src={page.avatarUrl} name={page.name} size="md" className="shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-extrabold text-[var(--color-text-primary)] truncate">
                    {page.name}
                  </p>
                  {page.isVerified && <VerifiedBadge size={14} />}
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] truncate tabular-nums">
                  @{page.slug} · {formatPageRoleLabel(normalizedRole)} ·{' '}
                  {page.followersCount.toLocaleString()} followers
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('page-profile', { pageId: page.id })}
              className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap shrink-0"
            >
              View Profile
            </button>
          </div>

          {groupedCategories.map(({ group, items }) => (
            <div key={group} className="space-y-2">
              <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                {group}
              </h2>
              <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border)] overflow-hidden">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isDanger = item.tone === 'danger';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openSection(item.id)}
                      className="w-full min-h-[60px] p-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-bg-main)]/70 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isDanger
                              ? 'bg-rose-500/10 text-rose-500'
                              : 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-bold ${
                                isDanger ? 'text-rose-500' : 'text-[var(--color-text-primary)]'
                              }`}
                            >
                              {item.title}
                            </span>
                            {item.meta && (
                              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] tabular-nums">
                                · {item.meta}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 leading-snug">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)] shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        renderSectionContent()
      )}

      {/* Unsaved Changes Confirmation Modal */}
      {pendingLeaveTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPendingLeaveTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">
              Discard unsaved changes?
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              You have unsaved edits in {activeMeta?.title || 'this settings screen'}. If you go back now, those changes will be lost.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingLeaveTarget(null)}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)]"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingLeaveTarget === 'back') {
                    setIsDirty(false);
                    setPendingLeaveTarget(null);
                    goBack();
                  } else {
                    leaveToHub();
                  }
                }}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
