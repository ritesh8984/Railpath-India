import React from 'react';

/**
 * PHASE 1 & PHASE 4 — RAILPATH INDIA GLOBAL DESIGN SYSTEM PRIMITIVES
 * Palette:
 * - Background: #F8FAFC
 * - Surface: #FFFFFF
 * - Primary text: #17243B
 * - Secondary text: #64748B
 * - Primary blue: #2447A8
 * - Muted teal: #168A83
 * - Success: #15803D
 * - Borders: #E6EAF0
 */

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  as?: 'main' | 'div' | 'section' | 'footer';
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = '',
  as: Component = 'div',
}) => {
  return (
    <Component
      className={`max-w-[1160px] w-full mx-auto px-4 sm:px-6 lg:px-8 ${className}`}
    >
      {children}
    </Component>
  );
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  elevated?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  elevated = false,
  padding = 'md',
  className = '',
  ...rest
}) => {
  const padClass =
    padding === 'none'
      ? ''
      : padding === 'sm'
      ? 'p-3.5 sm:p-4'
      : padding === 'lg'
      ? 'p-5 sm:p-7'
      : 'p-4 sm:p-5';

  return (
    <div
      className={`bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl ${
        elevated ? 'rp-shadow-panel' : 'rp-shadow-card'
      } ${padClass} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};

export interface SearchPanelProps
  extends React.FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  children,
  className = '',
  ...rest
}) => {
  return (
    <form
      className={`bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl rp-shadow-panel p-3.5 sm:p-5 lg:p-6 transition-shadow ${className}`}
      {...rest}
    >
      {children}
    </form>
  );
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...rest
}) => {
  const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary:
      'bg-[#2447A8] hover:bg-[#1D3B8E] active:bg-[#172F73] text-white font-semibold shadow-[0_2px_6px_rgba(36,71,168,0.22)] focus-visible:ring-2 focus-visible:ring-[#2447A8] focus-visible:ring-offset-2',
    secondary:
      'bg-[#FFFFFF] hover:bg-[#F8FAFC] text-[#17243B] font-medium border border-[#E6EAF0] hover:border-[#CBD5E1] focus-visible:ring-2 focus-visible:ring-[#2447A8]',
    subtle:
      'bg-[#F8FAFC] hover:bg-[#EEF2F7] text-[#17243B] font-medium border border-[#E6EAF0] focus-visible:ring-2 focus-visible:ring-[#2447A8]',
    ghost:
      'bg-transparent hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#17243B] font-medium focus-visible:ring-2 focus-visible:ring-[#2447A8]',
  };

  const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'min-h-[34px] px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'min-h-[42px] px-4 py-2 text-sm rounded-xl gap-2',
    lg: 'min-h-[50px] sm:min-h-[56px] px-6 sm:px-7 py-3 text-sm sm:text-[15px] rounded-xl gap-2.5',
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center transition-all duration-150 focus:outline-none cursor-pointer shrink-0 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export interface NavigationItemProps {
  label: string;
  href?: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  mobile?: boolean;
}

export const NavigationItem: React.FC<NavigationItemProps> = ({
  label,
  href = '#',
  active,
  onClick,
  icon,
  mobile = false,
}) => {
  if (mobile) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`relative flex flex-col items-center justify-center h-full min-h-[44px] px-1 transition-colors cursor-pointer ${
          active
            ? 'text-[#2447A8] font-semibold'
            : 'text-[#64748B] hover:text-[#17243B] font-medium'
        }`}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2.5px] rounded-b-full bg-[#2447A8]"
          />
        )}
        {icon && <span className="w-4 h-4 flex items-center justify-center">{icon}</span>}
        <span className="text-[10px] tracking-tight mt-1 leading-none">
          {label}
        </span>
      </button>
    );
  }

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      aria-current={active ? 'page' : undefined}
      className={`relative inline-flex items-center gap-2 h-16 px-1 text-[13.5px] transition-colors whitespace-nowrap shrink-0 ${
        active
          ? 'text-[#17243B] font-semibold'
          : 'text-[#64748B] hover:text-[#17243B] font-medium'
      }`}
    >
      <span>{label}</span>
      {active && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#2447A8] rounded-t-full"
        />
      )}
    </a>
  );
};

export interface SectionHeadingProps {
  eyebrow?: React.ReactNode;
  title: string;
  subtitle?: string;
  headingTestId?: string;
  subtitleTestId?: string;
  rightContent?: React.ReactNode;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  eyebrow,
  title,
  subtitle,
  headingTestId,
  subtitleTestId,
  rightContent,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-1.5 sm:gap-4">
      <div className="space-y-1 sm:space-y-1.5">
        {eyebrow && (
          <div className="inline-flex items-center gap-2 text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] text-[#168A83]">
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-[#168A83] shrink-0"
            />
            <span className="truncate">{eyebrow}</span>
          </div>
        )}
        <h1
          data-testid={headingTestId}
          className="text-[22px] sm:text-[32px] lg:text-[36px] leading-[1.15] font-bold text-[#17243B] tracking-[-0.025em]"
        >
          {title}
        </h1>
        {subtitle && (
          <p
            data-testid={subtitleTestId}
            className="text-[12.5px] sm:text-[15px] text-[#64748B] leading-snug sm:leading-relaxed max-w-xl"
          >
            {subtitle}
          </p>
        )}
      </div>
      {rightContent && <div className="shrink-0">{rightContent}</div>}
    </div>
  );
};

export interface StatusIndicatorProps {
  tone?: 'teal' | 'success' | 'blue' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  tone = 'teal',
  children,
  className = '',
}) => {
  const dotColors: Record<NonNullable<StatusIndicatorProps['tone']>, string> = {
    teal: 'bg-[#168A83]',
    success: 'bg-[#15803D]',
    blue: 'bg-[#2447A8]',
    neutral: 'bg-[#64748B]',
  };

  const textColors: Record<NonNullable<StatusIndicatorProps['tone']>, string> = {
    teal: 'text-[#168A83]',
    success: 'text-[#15803D]',
    blue: 'text-[#2447A8]',
    neutral: 'text-[#64748B]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColors[tone]} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[tone]}`}
      />
      <span>{children}</span>
    </span>
  );
};
