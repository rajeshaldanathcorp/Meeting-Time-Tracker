import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Meeting Time Tracker',
  description: 'Track and analyze your Microsoft Teams meetings',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function getTheme() {
                  try {
                    const storedTheme = localStorage.getItem('theme');
                    if (storedTheme) return storedTheme;
                    
                    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                      return 'dark';
                    }
                    return 'light';
                  } catch (e) {
                    return 'light';
                  }
                }

                const theme = getTheme();
                document.documentElement.setAttribute('data-theme', theme);
                document.documentElement.style.colorScheme = theme;
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
