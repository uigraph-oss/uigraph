import { cn } from '@/lib/utils'

export function UIGraphLogo({ className }: { className?: string }) {
  return (
    <img
      src="/icons/icon-blue-256.png"
      alt="UIGraph Logo"
      width={52}
      height={52}
      className={cn('rounded-full', className)}
    />
  )
}
