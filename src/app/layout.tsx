import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { NavbarSerialProvider } from "@/contexts/NavbarSerialContext";
import { EditModeProvider } from "@/contexts/EditModeContext";
import { EditModeFAB } from "@/components/EditModeFAB";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavbarAuthSection } from "@/components/auth/NavbarAuthSection";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default async function RootLayout(props: RootLayoutProps) {
  const { children } = props;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="h-full overflow-hidden flex flex-col"
        suppressHydrationWarning
      >
        <TooltipProvider>
          <EditModeProvider>
            <NavbarSerialProvider authSlot={<NavbarAuthSection />}>
              <Navbar />
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {children}
              </div>
              <EditModeFAB />
            </NavbarSerialProvider>
          </EditModeProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
