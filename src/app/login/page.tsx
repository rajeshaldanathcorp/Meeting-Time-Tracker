'use client';

import { Logo } from '@/components/ui/logo';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <Logo size="lg" className="mb-8" />
      <Button 
        size="lg"
        onClick={() => signIn('azure-ad')}
      >
        Sign in with Microsoft
      </Button>
    </div>
  );
} 