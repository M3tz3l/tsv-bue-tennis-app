import type { ReactNode } from 'react';
import TSVLogo from '@/assets/TSV_Tennis.svg';

type AuthPageLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

const AuthPageLayout = ({ title, description, children }: AuthPageLayoutProps) => (
  <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-to-br from-green-50 to-blue-50">
    <div className="max-w-md w-full">
      <div className="bg-white rounded-xl shadow-xl p-8 backdrop-blur-sm border border-white/20 ring-1 ring-black/5">
        <div className="flex flex-col items-center">
          <div className="mx-auto flex items-center justify-center mb-4">
            <img
              src={TSVLogo}
              alt="TSV Tennis Logo"
              className="h-20 w-auto drop-shadow-md hover:drop-shadow-lg transition-all duration-300"
            />
          </div>
          <h2 className="mt-2 text-center text-3xl font-bold text-gray-900">{title}</h2>
          {description && <p className="mt-2 text-center text-sm text-gray-600">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  </div>
);

export default AuthPageLayout;
