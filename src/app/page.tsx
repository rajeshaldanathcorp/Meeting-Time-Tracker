'use client';

import { signIn } from 'next-auth/react';
import { Logo } from '@/components/ui/logo';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 sm:px-6">
      <div className="text-center flex flex-col items-center w-full max-w-md mx-auto">
        <Logo size="lg" variant="login" className="mb-8 sm:mb-16" />
        <h1 className="text-2xl sm:text-4xl font-bold mb-4 text-foreground">
          Meeting Time Tracker 
          <span className="inline-flex items-center rounded-md bg-blue-400/10 px-2 py-1 text-sm font-medium text-blue-400 ring-1 ring-inset ring-blue-400/30 align-middle ml-2 dark:bg-blue-500/20 dark:text-blue-300 dark:ring-blue-500/30">
            Beta
          </span>
        </h1>
        <p className="text-muted-foreground mb-6 sm:mb-8 text-sm sm:text-base">
          Sign in with your NathCorp Account to access your meetings
        </p>
        <button
          className="bg-[#0078d4] text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-full hover:bg-blue-600 inline-flex items-center justify-center gap-2 text-sm sm:text-base font-medium w-full sm:w-auto sm:min-w-[250px] mb-4 transition-colors duration-200"
          onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard' })}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.5 3.25H3.25V9.5H9.5V3.25Z" />
            <path d="M9.5 10.5H3.25V16.75H9.5V10.5Z" />
            <path d="M16.75 3.25H10.5V9.5H16.75V3.25Z" />
            <path d="M16.75 10.5H10.5V16.75H16.75V10.5Z" />
          </svg>
          Sign in with NathCorp Organization ID
        </button>
        <p className="text-sm text-muted-foreground">Version 2.1.0</p>
      </div>
    </div>
  );
}
