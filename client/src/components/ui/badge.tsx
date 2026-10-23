import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)]',
        accent: 'border-[rgba(201,169,98,0.3)] bg-[rgba(201,169,98,0.1)] text-[var(--accent)]',
        success: 'border-[rgba(107,158,120,0.3)] bg-[rgba(107,158,120,0.1)] text-[var(--accent-green)]',
        warning: 'border-[rgba(196,163,90,0.3)] bg-[rgba(196,163,90,0.1)] text-[var(--accent-yellow)]',
        danger: 'border-[rgba(184,92,92,0.3)] bg-[rgba(184,92,92,0.1)] text-[var(--accent-red)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
