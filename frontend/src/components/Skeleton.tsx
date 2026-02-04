import clsx from 'clsx'

export default function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('shimmer animate-shimmer rounded-2xl h-4', className)} />
}
