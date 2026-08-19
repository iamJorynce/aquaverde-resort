export default function TideLine({ color = '#C97B4A' }: { color?: string }) {
  return (
    <div className="flex items-center justify-center py-2" aria-hidden="true">
      <svg width="120" height="12" viewBox="0 0 120 12" fill="none">
        <path
          d="M0 6C10 2 20 10 30 6C40 2 50 10 60 6C70 2 80 10 90 6C100 2 110 10 120 6"
          stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"
        />
      </svg>
    </div>
  )
}
