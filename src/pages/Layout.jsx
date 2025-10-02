import React, { useEffect } from "react";

export default function Layout({ children, currentPageName }) {

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');

    root.style.setProperty('--primary', '16 90% 58%'); // Coral/Orange
    root.style.setProperty('--background', '20 14% 8%'); // Warm dark brown
    root.style.setProperty('--foreground', '30 20% 98%'); // Warm light text
    root.style.setProperty('--card', '20 20% 15%'); // Warm dark card
    root.style.setProperty('--card-foreground', '30 20% 98%');
    root.style.setProperty('--popover', '20 20% 15%');
    root.style.setProperty('--popover-foreground', '30 20% 98%');
    root.style.setProperty('--secondary', '20 20% 15%');
    root.style.setProperty('--secondary-foreground', '30 20% 98%');
    root.style.setProperty('--muted', '20 20% 15%');
    root.style.setProperty('--muted-foreground', '30 10% 60%');
    root.style.setProperty('--accent', '20 20% 15%');
    root.style.setProperty('--accent-foreground', '30 20% 98%');
    root.style.setProperty('--destructive', '0 62.8% 30.6%');
    root.style.setProperty('--destructive-foreground', '30 20% 98%');
    root.style.setProperty('--border', '20 20% 18%'); // Warm border
    root.style.setProperty('--input', '20 20% 15%');
    root.style.setProperty('--ring', '16 90% 58%'); // Coral ring
    root.style.setProperty('--radius', '0.75rem');
  }, []);

  return (
    <div className="min-h-screen bg-stone-950">
      {children}
    </div>
  );
}