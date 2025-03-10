import { useState } from 'react';
import { Button } from './button';
import { Menu, X, LayoutDashboard, Calendar, Clock, Settings2, ChevronLeft, ChevronRight, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
  currentView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ className, currentView, onViewChange }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const navigationItems = [
    {
      name: 'Dashboard',
      icon: LayoutDashboard,
      view: 'dashboard'
    },
    {
      name: 'Posted Meetings',
      icon: FileCheck,
      view: 'posted-meetings'
    },
    {
      name: 'AI Agent',
      icon: FileCheck,
      view: 'ai-agent'
    }
  ];

  return (
    <div className={cn(
      "flex flex-col h-screen bg-background border-r transition-all duration-300",
      isExpanded ? "w-64" : "w-16",
      className
    )}>
      {/* Hamburger toggle */}
      <div className="flex justify-end p-4">
        <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1">
        <ul className="space-y-2 px-2">
          {navigationItems.map((item) => (
            <li key={item.view}>
              <Button 
                variant={currentView === item.view ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  !isExpanded && "justify-center px-2"
                )}
                onClick={() => onViewChange(item.view)}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {isExpanded && <span>{item.name}</span>}
              </Button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile Menu Overlay */}
      <div className="lg:hidden">
        <Button variant="ghost" size="icon" className="fixed top-4 right-4 z-50" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
} 