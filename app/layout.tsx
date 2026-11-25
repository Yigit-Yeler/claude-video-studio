import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { ColorSchemeScript, MantineProvider, createTheme, mantineHtmlProps } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/DashboardShell";
import "./globals.css";

const theme = createTheme({
  primaryColor: "violet",
  defaultRadius: "md",
  fontFamily: "Segoe UI, system-ui, sans-serif",
  headings: { fontFamily: "Segoe UI, system-ui, sans-serif" },
});

export const metadata: Metadata = {
  title: "Creator Dashboard",
  description: "Lokal 9:16 video üretim paneli",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" {...mantineHtmlProps} data-mantine-color-scheme="dark">
      <head>
        <ColorSchemeScript defaultColorScheme="dark" forceColorScheme="dark" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="dark" forceColorScheme="dark">
          <Notifications position="top-right" />
          <DashboardShell>{children}</DashboardShell>
        </MantineProvider>
      </body>
    </html>
  );
}
