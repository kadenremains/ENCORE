export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2f4f8" />
          <stop offset="1" stopColor="#8a93a1" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#logo-g)" />
      <path d="M32 6a26 26 0 0 1 0 52z" fill="#0b0b0f" opacity=".45" />
      <circle cx="32" cy="32" r="7" fill="#0b0b0f" />
    </svg>
  );
}
