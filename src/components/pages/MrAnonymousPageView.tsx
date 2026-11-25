import React from 'react';
import { MR_ANONYMOUS_PAGE_ID } from '../../lib/pageService.ts';
import { PageProfileView } from './PageProfileView.tsx';

export const MrAnonymousPageView: React.FC = () => {
  return <PageProfileView forcedPageId={MR_ANONYMOUS_PAGE_ID} />;
};
