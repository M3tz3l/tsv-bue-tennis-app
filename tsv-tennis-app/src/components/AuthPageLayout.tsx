import type { ReactNode } from 'react';
import TSVLogo from '@/assets/TSV_Tennis.svg';

type AuthPageLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

const AuthPageLayout = ({ title, description, children }: AuthPageLayoutProps) => (
  <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-[var(--canvas)]">
    <div className="max-w-md w-full">
      <div className="bg-white rounded-xl border border-[var(--hairline)] p-8">
        <div className="flex flex-col items-center">
          <div className="mx-auto flex items-center justify-center mb-4">
            <img
              src={TSVLogo}
              alt="TSV Tennis Logo"
              className="h-16 w-auto"
            />
          </div>
          <h2 className="mt-2 text-center text-2xl font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
          {description && <p className="mt-2 text-center text-sm text-[var(--body)]">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  </div>
);

export default AuthPageLayout;
