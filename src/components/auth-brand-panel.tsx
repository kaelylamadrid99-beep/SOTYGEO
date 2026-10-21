export function AuthBrandPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-sidebar p-10 lg:flex lg:flex-col lg:justify-between">
      <p className="font-display text-sm tracking-[0.28em] text-muted-foreground">SOTYGEO</p>
      <div>
        <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-wide">
          La flota, en el mapa.
          <br />
          En tiempo real.
        </h1>
        <p className="mt-5 max-w-md text-sm text-muted-foreground">
          Rastreo GPS, geocercas, historial de rutas, inspecciones y reportes para operación de flotillas.
        </p>
        <svg viewBox="0 0 520 220" className="mt-12 w-full max-w-lg text-border" fill="none" aria-hidden="true">
          <path d="M20 160 C 80 40, 140 40, 200 110 S 320 210, 500 70" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="200" cy="110" r="5" fill="#0d9488" />
          <circle cx="500" cy="70" r="4" fill="#94a3b8" />
          <circle cx="20" cy="160" r="4" fill="#64748b" />
          <rect x="188" y="86" width="46" height="16" rx="3" fill="#0d9488" stroke="#0f766e" />
          <text x="211" y="97" textAnchor="middle" fill="#ffffff" fontSize="8" fontFamily="Barlow Condensed">
            SM-01
          </text>
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">Sierra Madre · corredor norte de México</p>
    </section>
  );
}
