import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'login' | 'dashboard';
}

const sizes = {
  sm: { width: 60, height: 30 },     // For very small displays
  md: { width: 80, height: 40 },     // For dashboard header
  lg: { width: 240, height: 240 },   // For login page
};

export function Logo({ className, size = 'md', variant = 'dashboard' }: LogoProps) {
  const dimensions = sizes[size];
  
  const logoSrc = variant === 'login' 
    ? "/nathcorp-logo-large.svg"    // For login page (240x240)
    : "/nathcorp-logo-small.svg";   // For dashboard header (140x140)
  
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <Image
        src={logoSrc}
        alt="NATHCORP"
        width={dimensions.width}
        height={dimensions.height}
        priority
        className="object-contain"
      />
    </div>
  );
} 