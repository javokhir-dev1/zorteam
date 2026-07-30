export const metadata = {
  title: "Zo'r team",
};

// Telegram SDK ildiz layoutda yuklanadi (app/layout.tsx)
export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-24 pt-4">{children}</div>;
}
